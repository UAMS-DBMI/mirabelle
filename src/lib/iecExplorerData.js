/**
 * Data layer for the IEC explorer (see components/IecExplorer.jsx).
 *
 * Every VR list endpoint returns bare ids, so each row enriches itself here:
 * per-id details (modality, series, status) and a small rendered thumbnail.
 * Both are cached at module level so the explorer stays warm across IEC
 * navigation. The details are also remembered in this browser, so after a
 * reload every row shows at once and is refreshed in the background;
 * thumbnails aren't, since they're renders of the images.
 */
import * as cornerstone from "@cornerstonejs/core";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

import { getDicomDetails, getNiftiDetails } from "@/visualreview";
import { getMaskingDetails } from "@/masking";
import { isExamFile } from "@/lib/examDownloads";
import { renderImageToCanvas } from "@/lib/renderImageToCanvas";

/**
 * Run async tasks with bounded concurrency. Row enrichment and thumbnail
 * rendering fire one task per list row — unbounded, a long VR would open
 * hundreds of concurrent requests and starve the exam load the curator is
 * actually waiting on. A task can be hurried (rows on screen): it then starts
 * ahead of the ones queued for the background fill.
 *
 * Returns a function that queues a task and returns `{ promise, hurry }`.
 */
function createLimiter(maxConcurrent) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < maxConcurrent && waiting.length > 0) {
      const urgentIndex = waiting.findIndex((job) => job.urgent);
      const [job] = waiting.splice(Math.max(urgentIndex, 0), 1);
      active += 1;
      job.start().finally(() => {
        active -= 1;
        next();
      });
    }
  };
  return (task) => {
    const job = { urgent: false, start: null };
    const promise = new Promise((resolve, reject) => {
      job.start = () => Promise.resolve().then(task).then(resolve, reject);
    });
    waiting.push(job);
    next();
    return {
      promise,
      // No effect once the task has started.
      hurry: () => {
        job.urgent = true;
      },
    };
  };
}

const infoLimiter = createLimiter(4);
const thumbnailLimiter = createLimiter(3);

/**
 * Bucket a backend status string for the explorer. The routes use different
 * vocabularies (review_status: Good/Bad/…, masking_status: accepted/skipped/…)
 * but the explorer only distinguishes "not acted on yet", "skipped", and
 * "done". Returns null for undefined — status genuinely unknown (e.g. the
 * nifti list, whose details payload carries no status) — so the UI can omit
 * the dot and counters instead of miscounting everything as pending.
 */
export function statusKind(status) {
  if (status === undefined) return null;
  if (status === null || status === "") return "pending";
  const s = String(status).toLowerCase();
  if (
    s === "readytoreview" ||
    s === "unreviewed" ||
    s === "pending" ||
    s.includes("await")
  ) {
    return "pending";
  }
  if (s.includes("skip")) return "skipped";
  return "done";
}

// Route-specific row enrichment. Each returns { secondary, count, status,
// volumetric }: secondary is the small line under the id, count the number of
// images, status the raw backend status (undefined = this route has none),
// volumetric whether the exam opens as a 3D volume vs a 2D stack.
const ROW_INFO_FETCHERS = {
  "dicom-review": async (id) => {
    const details = await getDicomDetails(id);
    return {
      secondary: [details.modality, details.series_description]
        .filter(Boolean)
        .join(" · "),
      count: details.file_count,
      status: details.review_status ?? null,
      volumetric: Boolean(details.volumetric),
    };
  },
  mask: async (id) => {
    const [details, maskingDetails] = await Promise.all([
      getDicomDetails(id),
      getMaskingDetails(id),
    ]);
    return {
      secondary: [details.modality, details.series_description]
        .filter(Boolean)
        .join(" · "),
      count: details.file_count,
      status: maskingDetails?.masking_status ?? null,
      volumetric: Boolean(details.volumetric),
    };
  },
  nifti: async (id) => {
    const details = await getNiftiDetails(id);
    return {
      secondary: details.import_name,
      count: null,
      // The nifti details payload has no review status field.
      status: undefined,
      // Nifti exams always open as a volume.
      volumetric: true,
    };
  },
};
ROW_INFO_FETCHERS["mask-review"] = ROW_INFO_FETCHERS.mask;

// ————— Remembered details —————
//
// Rows' details and size estimates, kept in localStorage between sessions.
// Read once, written back a moment after the last change. Past
// MAX_REMEMBERED the oldest are dropped, keeping the entry far below the
// browser's quota (a row is about 100 bytes).
const STORAGE_KEY = "mirabelle.iecExplorer.v1";
const MAX_REMEMBERED = 5000;
const SAVE_DELAY_MS = 1000;

let remembered = null; // { rows: Map<`${kind}:${id}`, info>, sizes: Map<id, bytes> }
let saveTimer = null;

function rememberedData() {
  if (remembered) return remembered;
  remembered = { rows: new Map(), sizes: new Map() };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    stored?.rows?.forEach(([key, info]) => remembered.rows.set(key, info));
    stored?.sizes?.forEach(([id, bytes]) => remembered.sizes.set(id, bytes));
  } catch (error) {
    console.warn("[iecExplorerData] couldn't read the remembered rows", error);
  }
  return remembered;
}

function saveRemembered() {
  saveTimer = null;
  const { rows, sizes } = rememberedData();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rows: [...rows], sizes: [...sizes] }),
    );
  } catch (error) {
    console.warn("[iecExplorerData] couldn't remember the rows", error);
  }
}

// A Map keeps insertion order, so re-inserting puts `key` last and the
// oldest entry is always first.
function remember(map, key, value) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value);
  if (saveTimer === null) {
    saveTimer = setTimeout(saveRemembered, SAVE_DELAY_MS);
  }
}

const rowInfoRequests = new Map(); // `${kind}:${id}` -> { promise, hurry }

/** The newest details known for a row (this session or remembered), or null. */
export function peekRowInfo(kind, id) {
  return rememberedData().rows.get(`${kind}:${id}`) ?? null;
}

/**
 * Cached, concurrency-limited row details. `urgent` moves a queued request
 * ahead of the background fill (a row on screen). `fresh: true` bypasses the
 * cache — used for the row the curator just acted on, whose status changed
 * server-side. Failed fetches are evicted so scrolling back to a row retries
 * it.
 */
export function getRowInfo(kind, id, { fresh = false, urgent = false } = {}) {
  const fetcher = ROW_INFO_FETCHERS[kind];
  if (!fetcher) {
    return Promise.reject(new Error(`Unknown IEC explorer kind: ${kind}`));
  }
  const key = `${kind}:${id}`;
  if (fresh) rowInfoRequests.delete(key);
  let request = rowInfoRequests.get(key);
  if (!request) {
    request = infoLimiter(() => fetcher(id));
    request.promise.then(
      (info) => remember(rememberedData().rows, key, info),
      (error) => {
        console.warn(`[iecExplorerData] details failed for ${id}:`, error);
        rowInfoRequests.delete(key);
      },
    );
    rowInfoRequests.set(key, request);
  }
  if (urgent) request.hurry();
  return request.promise;
}

// The frames list is needed twice per row — middle-frame thumbnail and size
// estimate — so cache the response per IEC instead of fetching it twice.
const framesInfoCache = new Map(); // iec -> Promise<{ files, totalFrames }>

function getFramesInfo(iec) {
  if (!framesInfoCache.has(iec)) {
    const promise = (async () => {
      const response = await fetch(`/papi/v1/iecs/${iec}/frames`);
      if (!response.ok) {
        throw new Error(
          `frames request failed for IEC ${iec}: ${response.status}`,
        );
      }
      const fileInfo = await response.json();
      const files = fileInfo.frames ?? [];
      const totalFrames = files.reduce(
        (total, file) => total + (file.num_of_frames || 1),
        0,
      );
      return { files, totalFrames };
    })();
    promise.catch(() => framesInfoCache.delete(iec));
    framesInfoCache.set(iec, promise);
  }
  return framesInfoCache.get(iec);
}

/**
 * Middle-frame imageId for an IEC, built the same way getIECInfo builds the
 * exam's frame list. The middle frame is the most representative slice of a
 * volume (first/last are often air or localizer edges).
 */
async function getMiddleFrameImageId(iec) {
  const { files } = await getFramesInfo(iec);
  if (files.length === 0) {
    throw new Error(`IEC ${iec} has no frames`);
  }
  const file = files[Math.floor(files.length / 2)];
  if (file.num_of_frames > 1) {
    return `wadouri:/files/${file.path}?frame=${Math.floor(file.num_of_frames / 2)}`;
  }
  return `wadouri:/files/${file.path}`;
}

// ————— Pre-load size estimates —————
//
// Decoded size of an exam BEFORE it is loaded: frame count (from the frames
// list) × one frame's rows × columns × bytes per pixel (from the middle
// frame's DICOM metadata, which the wadouri loader registers when the
// thumbnail downloads that frame). Costs no extra network beyond what the
// thumbnail already fetches; like the thumbnail, it appears when the row has
// scrolled into view, and is remembered with the row's details. Published as
// a version-counter external store so the explorer re-renders as estimates
// resolve.
let sizeEstimatesVersion = 0;
const sizeEstimateListeners = new Set();

export function subscribeSizeEstimates(listener) {
  sizeEstimateListeners.add(listener);
  return () => sizeEstimateListeners.delete(listener);
}

export function getSizeEstimatesVersion() {
  return sizeEstimatesVersion;
}

/** Estimated decoded bytes for an exam, or null while unknown. */
export function getCachedSizeEstimate(id) {
  return rememberedData().sizes.get(String(id)) ?? null;
}

async function recordSizeEstimate(id, middleFrameImageId) {
  const { sizes } = rememberedData();
  if (sizes.has(String(id))) return;
  const { totalFrames } = await getFramesInfo(id);
  const pixelModule = cornerstone.metaData.get(
    "imagePixelModule",
    middleFrameImageId,
  );
  const { rows, columns, bitsAllocated, samplesPerPixel } = pixelModule ?? {};
  if (!rows || !columns || !totalFrames) return;
  const bytesPerPixel = ((bitsAllocated ?? 16) / 8) * (samplesPerPixel ?? 1);
  remember(
    sizes,
    String(id),
    Math.round(totalFrames * rows * columns * bytesPerPixel),
  );
  sizeEstimatesVersion += 1;
  sizeEstimateListeners.forEach((listener) => listener());
}

// Rendered at about 2× the explorer's ~124px tiles, for retina screens.
const THUMBNAIL_SIZE = 256;
// A thumbnail that failed isn't tried again for this long: tiles remount as
// the grid scrolls, and each would otherwise download the broken file again.
const THUMBNAIL_RETRY_MS = 60_000;

const thumbnailCache = new Map(); // `${kind}:${id}` -> Promise<dataUrl>
const resolvedThumbnails = new Map(); // `${kind}:${id}` -> dataUrl
const failedThumbnails = new Map(); // `${kind}:${id}` -> time it failed

/**
 * Synchronous peek used on tile mount so previously rendered thumbnails paint
 * on the first frame instead of flickering through the placeholder.
 */
export function getCachedThumbnail(kind, id) {
  return resolvedThumbnails.get(`${kind}:${id}`) ?? null;
}

/**
 * An IEC's middle frame as a small JPEG data URL, or null while it can't be
 * drawn (see renderMiddleFrame) or after a recent failure; a null isn't
 * cached, so a later ask tries again. Nifti files have no cheap single frame
 * to fetch (one download is the whole volume), so that kind resolves to null
 * and the tile keeps its placeholder.
 */
export function getIecThumbnail(kind, id) {
  if (kind === "nifti") return Promise.resolve(null);
  const key = `${kind}:${id}`;
  if (Date.now() - (failedThumbnails.get(key) ?? 0) < THUMBNAIL_RETRY_MS) {
    return Promise.resolve(null);
  }
  if (!thumbnailCache.has(key)) {
    const { promise } = thumbnailLimiter(() => renderMiddleFrame(id));
    promise.then(
      (dataUrl) => {
        if (dataUrl) {
          resolvedThumbnails.set(key, dataUrl);
        } else {
          thumbnailCache.delete(key);
        }
      },
      (error) => {
        console.warn(`[iecExplorerData] thumbnail failed for ${id}:`, error);
        thumbnailCache.delete(key);
        failedThumbnails.set(key, Date.now());
      },
    );
    thumbnailCache.set(key, promise);
  }
  return thumbnailCache.get(key);
}

/**
 * Render an IEC's middle frame to a data URL: it survives exam-cache eviction
 * and costs a few KB instead of a full decoded frame. Its download waits in
 * lib/examDownloads' queue behind the frames of the exam on screen, so it
 * never competes with the exam the curator is loading.
 */
async function renderMiddleFrame(id) {
  const imageId = await getMiddleFrameImageId(id);
  const { url } = wadouri.parseImageId(imageId);
  // A file of an exam opened this session downloads in that exam's turn: the
  // queue holds it while the curator is on another exam, and a held thumbnail
  // would hold up every one behind it. So it's drawn once that exam has it.
  if (isExamFile(url) && !cornerstone.cache.getImage(imageId)) return null;
  const wasCached = Boolean(cornerstone.cache.getImageLoadObject(imageId));

  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  await renderImageToCanvas(canvas, imageId);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  // The frame carries the exam's pixel geometry: derive the size estimate
  // now, while its metadata is registered.
  await recordSizeEstimate(id, imageId).catch((error) => {
    console.warn(`[iecExplorerData] size estimate failed for ${id}:`, error);
  });
  // Keep only the data URL: a decoded frame of every listed exam would fill
  // the image cache outside the exam cache's budget (makeRoom in
  // utilities.js). Unless an exam has it, or has started loading meanwhile.
  if (!wasCached && !isExamFile(url)) {
    cornerstone.cache.removeImageLoadObject(imageId, { force: true });
  }
  return dataUrl;
}

/**
 * Data layer for the IEC queue panel (see components/IecQueue.jsx).
 *
 * Every VR list endpoint returns bare ids, so each row enriches itself here:
 * per-id details (modality, series, status) and a small rendered thumbnail.
 * Everything is cached at module level so the queue stays warm across IEC
 * navigation — the panel remounts on every route change, and re-fetching
 * hundreds of rows each time would hammer the backend for identical data.
 */
import * as cornerstone from "@cornerstonejs/core";

import { getDicomDetails, getNiftiDetails } from "@/visualreview";
import { getMaskingDetails } from "@/masking";

/**
 * Run async tasks with bounded concurrency. Row enrichment and thumbnail
 * rendering fire one task per list row — unbounded, a long VR would open
 * hundreds of concurrent requests and starve the exam load the curator is
 * actually waiting on.
 */
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

const infoLimiter = createLimiter(4);
const thumbnailLimiter = createLimiter(3);

/**
 * Bucket a backend status string for the queue UI. The routes use different
 * vocabularies (review_status: Good/Bad/…, masking_status: accepted/skipped/…)
 * but the queue only distinguishes "not acted on yet", "skipped", and "done".
 * Returns null for undefined — status genuinely unknown (e.g. the nifti list,
 * whose details payload carries no status) — so the UI can omit the dot and
 * counters instead of miscounting everything as pending.
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

const rowInfoCache = new Map(); // `${kind}:${id}` -> Promise<info>

/**
 * Cached, concurrency-limited row details. `fresh: true` bypasses the cache —
 * used for the row the curator just acted on, whose status changed server-side.
 * Failed fetches are evicted so scrolling back to a row retries it.
 */
export function getQueueRowInfo(kind, id, { fresh = false } = {}) {
  const fetcher = ROW_INFO_FETCHERS[kind];
  if (!fetcher) {
    return Promise.reject(new Error(`Unknown IEC queue kind: ${kind}`));
  }
  const key = `${kind}:${id}`;
  if (fresh) rowInfoCache.delete(key);
  if (!rowInfoCache.has(key)) {
    const promise = infoLimiter(() => fetcher(id));
    promise.catch(() => rowInfoCache.delete(key));
    rowInfoCache.set(key, promise);
  }
  return rowInfoCache.get(key);
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
// scrolled into view. Published as a version-counter external store so the
// queue re-renders as estimates resolve.
const sizeEstimates = new Map(); // idString -> bytes
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
  return sizeEstimates.get(String(id)) ?? null;
}

async function recordSizeEstimate(id, middleFrameImageId) {
  if (sizeEstimates.has(String(id))) return;
  const { totalFrames } = await getFramesInfo(id);
  const pixelModule = cornerstone.metaData.get(
    "imagePixelModule",
    middleFrameImageId,
  );
  const { rows, columns, bitsAllocated, samplesPerPixel } = pixelModule ?? {};
  if (!rows || !columns || !totalFrames) return;
  const bytesPerPixel = ((bitsAllocated ?? 16) / 8) * (samplesPerPixel ?? 1);
  sizeEstimates.set(
    String(id),
    Math.round(totalFrames * rows * columns * bytesPerPixel),
  );
  sizeEstimatesVersion += 1;
  sizeEstimateListeners.forEach((listener) => listener());
}

const THUMBNAIL_SIZE = 128; // rendered at 2× the ~40px display size for retina

const thumbnailCache = new Map(); // `${kind}:${id}` -> Promise<dataUrl>
const resolvedThumbnails = new Map(); // `${kind}:${id}` -> dataUrl

/**
 * Synchronous peek used on row mount so previously rendered thumbnails paint
 * on the first frame instead of flickering through the placeholder.
 */
export function getCachedThumbnail(kind, id) {
  return resolvedThumbnails.get(`${kind}:${id}`) ?? null;
}

/**
 * Render an IEC's middle frame to a small JPEG data URL. Stored as a data URL
 * (not a live cornerstone image) so the thumbnail survives exam-cache
 * eviction and costs a few KB instead of a full decoded frame. Thumbnail
 * requests go through the image-load pool at Thumbnail priority so they never
 * compete with the exam the curator is loading. Nifti files have no cheap
 * single frame to fetch (one download is the whole volume), so that kind
 * resolves to null and the row keeps its placeholder.
 */
export function getIecThumbnail(kind, id) {
  if (kind === "nifti") return Promise.resolve(null);
  const key = `${kind}:${id}`;
  if (!thumbnailCache.has(key)) {
    const promise = thumbnailLimiter(async () => {
      const imageId = await getMiddleFrameImageId(id);
      const canvas = document.createElement("canvas");
      canvas.width = THUMBNAIL_SIZE;
      canvas.height = THUMBNAIL_SIZE;
      await cornerstone.utilities.loadImageToCanvas({
        canvas,
        imageId,
        thumbnail: true,
        requestType: cornerstone.Enums.RequestType.Thumbnail,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolvedThumbnails.set(key, dataUrl);
      // The frame we just downloaded carries the exam's pixel geometry —
      // derive the size estimate now, while its metadata is registered.
      recordSizeEstimate(id, imageId).catch((error) => {
        console.warn(`[iecQueueData] size estimate failed for ${id}:`, error);
      });
      return dataUrl;
    });
    promise.catch(() => thumbnailCache.delete(key));
    thumbnailCache.set(key, promise);
  }
  return thumbnailCache.get(key);
}

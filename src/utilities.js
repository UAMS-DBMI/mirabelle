// import DEBUG, { log } from '@/debug';
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";
import createImageIdsAndCacheMetaData from "./lib/createImageIdsAndCacheMetaData";
import { eventTarget, triggerEvent } from "@cornerstonejs/core";
import { useSearchParams } from "react-router-dom";

import { requestJSON } from "@/lib/http";
import { messages } from "@/lib/messages";
import { notify } from "@/lib/notify";

const { volumeLoader, imageLoader, metaData } = cornerstone;
const { Enums: csToolsEnums, segmentation: csToolsSegmentation } =
  cornerstoneTools;
const { Cornerstone3D } = cornerstoneAdapters.adaptersSEG;

import dcmjs from "dcmjs";

export function getCoordsForStackSeg(imageIds) {
  let imin = Infinity,
    jmin = Infinity,
    kmin = Infinity;
  let imax = -Infinity,
    jmax = -Infinity,
    kmax = -Infinity;

  imageIds.forEach((imageId, k) => {
    const image = cornerstone.cache.getImage(imageId);
    const pixelData = image.getPixelData();
    const { rows, columns } = image;

    let sliceHasData = false;

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const index = j * columns + i;
        if (pixelData[index] > 0) {
          sliceHasData = true;
          if (i < imin) imin = i;
          if (i > imax) imax = i;
          if (j < jmin) jmin = j;
          if (j > jmax) jmax = j;
        }
      }
    }

    if (sliceHasData) {
      if (k < kmin) kmin = k;
      if (k > kmax) kmax = k;
    }
  });

  if (imin === Infinity) {
    return null; // No segmentation found
  }

  return {
    i: { min: imin, max: imax },
    j: { min: jmin, max: jmax },
    k: { min: kmin, max: kmax },
  };
}

/**
 * A generic distance calucaltion between two (3D) points
 */
export function calculateDistance(point1, point2) {
  const dx = point2[0] - point1[0];
  const dy = point2[1] - point1[1];
  const dz = point2[2] - point1[2];

  const distance = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);

  return distance;
}

/*
 * Bounding box (IJK min/max per axis) of the painted voxels in a segmentation,
 * or null if nothing is painted.
 *
 * This reads the voxel manager's tracked bounds, which cornerstone narrows as
 * voxels are painted (setAtIndex/setAtIJK call addBounds). It's O(1) — no
 * scanning of the scalar data. The bounds start at [Infinity, -Infinity], so an
 * untouched min of Infinity means nothing has been drawn.
 */
export function getLabelmapBounds(segmentationId) {
  const voxelManager = cornerstone.cache.getVolume(segmentationId)?.voxelManager;
  if (!voxelManager) {
    return null;
  }

  const [[imin, imax], [jmin, jmax], [kmin, kmax]] = voxelManager.boundsIJK;
  if (imin === Infinity) {
    return null;
  }

  return {
    i: { min: imin, max: imax },
    j: { min: jmin, max: jmax },
    k: { min: kmin, max: kmax },
  };
}

/*
 * Return true if the given segmentation is
 * empty or flat (exists in only one plane / 2 dimensions)
 */
export function isSegFlat(segmentationId) {
  const segmentationVolume = cornerstone.cache.getVolume(segmentationId);
  const { dimensions, voxelManager } = segmentationVolume;

  const bounds = voxelManager.getBoundsIJK();

  const { flat } = isFlat(bounds);
  return flat;
}

function isFlat(bounds, eps = 1e-6) {
  const [[imin, imax], [jmin, jmax], [kmin, kmax]] = bounds;

  // Normalize (handle reversed min/max)
  const iExtent = Math.abs(imax - imin);
  const jExtent = Math.abs(jmax - jmin);
  const kExtent = Math.abs(kmax - kmin);

  const extents = [iExtent, jExtent, kExtent];

  const zeroI = iExtent <= eps;
  const zeroJ = jExtent <= eps;
  const zeroK = kExtent <= eps;

  let plane = null;
  if (zeroI && !zeroJ && !zeroK) plane = "i";
  else if (!zeroI && zeroJ && !zeroK) plane = "j";
  else if (!zeroI && !zeroJ && zeroK) plane = "k";
  else if (zeroI || zeroJ || zeroK) {
    // Degenerate cases (line or point): still "flat"
    plane = zeroI ? "i" : zeroJ ? "j" : "k";
  }

  return { flat: zeroI || zeroJ || zeroK, plane, extents };
}

export async function getUsername() {
  const details = await requestJSON(`/papi/v1/other/testme`);
  return details.username;
}

export async function getFiles(iec) {
  const details = await requestJSON(`/papi/v1/iecs/${iec}/files`);
  return details.file_ids;
}

/**
 * Get the file list for an IEC, or the reviewfiles list
 */
export async function getIECInfo(
  iec,
  mask_review = false,
  decimate_count = 2000,
) {
  let response;

  if (mask_review) {
    response = await fetch(`/papi/v1/masking/${iec}/reviewfiles`);
  } else {
    response = await fetch(`/papi/v1/iecs/${iec}/frames`);
  }

  let volumetric;
  let frames = [];

  if (response && response.ok) {
    let fileInfo = await response.json();
    volumetric = fileInfo.volumetric;

    for (let file of fileInfo.frames) {
      for (let i = 0; i < file.num_of_frames; i++) {
        if (file.num_of_frames > 1) {
          frames.push(`wadouri:/files/${file.path}?frame=${i}`);
        } else {
          frames.push(`wadouri:/files/${file.path}`);
        }
      }
    }
  }

  frames = decimateFrames(frames, decimate_count);

  return { volumetric, frames };
}

function decimateFrames(imageIds, maxFrames = 2000) {
  // Decimate Z if too many frames
  let usedImageIds = imageIds;
  if (Array.isArray(imageIds) && imageIds.length > maxFrames) {
    const step = Math.ceil(imageIds.length / maxFrames);
    const decimated = [];
    for (let i = 0; i < imageIds.length; i += step) {
      decimated.push(imageIds[i]);
    }
    // Ensure last slice is included
    if (decimated[decimated.length - 1] !== imageIds[imageIds.length - 1]) {
      decimated.push(imageIds[imageIds.length - 1]);
    }
    usedImageIds = decimated;
    console.warn(
      `Decimating volume along Z: ${imageIds.length} -> ${usedImageIds.length} frames (step=${step})`,
    );
  }

  return usedImageIds;
}

export async function getIECsForDicomVR(visual_review_id) {
  return requestJSON(
    `/papi/v1/visualreviews/${visual_review_id}/iecs`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getFilteredIECsForDicomVR(
  visual_review_id,
  review_status = "*",
  dicom_file_type = "*",
  processing_status = "*",
) {
  // Accept 'All' from URL/UI and translate to '*' for the API.
  // Also treat the literal string 'undefined' (from stale URLs) as 'All'.
  const mapAllToStar = (v) =>
    v == null || v === "" || v === "All" || v === "undefined" ? "*" : v;
  // Special-case review status: 'Unreviewed' must be null in the API payload
  const mapReviewStatus = (v) => {
    if (v === "Unreviewed") return null;
    return mapAllToStar(v);
  };
  const _review_status = mapReviewStatus(review_status);
  const _dicom_file_type = mapAllToStar(dicom_file_type);
  const _processing_status = mapAllToStar(processing_status);

  const payload = {
    dicom_file_type: _dicom_file_type,
    processing_status: _processing_status,
    review_status: _review_status,
  };

  return requestJSON(
    `/papi/v1/visualreviews/${visual_review_id}/filter`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getValuesForDicomVR(visual_review_id) {
  return requestJSON(`/papi/v1/visualreviews/${visual_review_id}/values`);
}

export async function getIECsForMaskVR(visual_review_id) {
  return requestJSON(
    `/papi/v1/masking/visualreview/${visual_review_id}`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getFilteredIECsForMaskVR(
  visual_review_id,
  masking_status = "All",
  dicom_file_type = "All",
) {
  const params = new URLSearchParams();
  if (masking_status && masking_status !== "All") {
    params.set("masking_status", masking_status.toLowerCase());
  }
  if (dicom_file_type && dicom_file_type !== "All") {
    params.set("dicom_file_type", dicom_file_type);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return requestJSON(
    `/papi/v1/masking/visualreview/${visual_review_id}${query}`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getIECsForMaskReviewVR(visual_review_id) {
  return requestJSON(
    `/papi/v1/masking/visualreview/${visual_review_id}?awaiting_review=true`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getFilteredIECsForMaskReviewVR(
  visual_review_id,
  masking_status = "All",
  dicom_file_type = "All",
) {
  const params = new URLSearchParams();
  params.set("awaiting_review", "true");
  if (masking_status && masking_status !== "All") {
    params.set("masking_status", masking_status.toLowerCase());
  }
  if (dicom_file_type && dicom_file_type !== "All") {
    params.set("dicom_file_type", dicom_file_type);
  }
  return requestJSON(
    `/papi/v1/masking/visualreview/${visual_review_id}?${params.toString()}`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function getOtherIECsForFOR(iec) {
  return requestJSON(`/papi/v1/iecs/${iec}/other_iecs_in_for`);
}

export async function getFilesForNiftiVR(nifti_visual_review_id) {
  return requestJSON(
    `/papi/v1/nifti/visualreview/${nifti_visual_review_id}`,
    undefined,
    { errorMessage: messages.filters.loadFailed },
  );
}

export async function loadIECVolumeAndSegmentation(
  iec,
  volumeId,
  segmentationId,
) {
  let imageIds;
  try {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: `iec:${iec}`,
      SeriesInstanceUID: "any",
      wadoRsRoot: "/papi/v1/wadors",
    });
  } catch (error) {
    console.log(error);
    return;
  }

  if (!imageIds || imageIds.length === 0) {
    console.log("No imageIds found for IEC:", iec);
    return;
  }

  return await loadVolumeAndSegmentation(imageIds, volumeId, segmentationId);
}

// ————— Exam cache management —————
//
// Previously visited exams stay cached so navigating back to them is instant.
// All exam data (source slices and labelmap slices) lives in Cornerstone's
// fixed-size image cache — and because this app loads `wadouri:` imageIds,
// every source slice is pinned there (the loader sets a sharedCacheKey),
// which makes it invisible to Cornerstone's own eviction: once pinned bytes
// fill the cache, every further load throws CACHE_SIZE_EXCEEDED and nothing
// recovers. So we do the evicting ourselves, at whole-exam granularity,
// before each load: least-recently-viewed exams go first, and an exam is
// always evicted completely (volume exams with their derived labelmaps,
// stack exams with all their slices) so nothing is ever left half-cached.

// Exam key -> Date.now() of the last visit; drives LRU eviction order.
// Volume exams are keyed by volumeId, stack exams by their first imageId
// (stable across visits, unlike the per-visit random segmentationId).
const examLastVisited = new Map();

// Stack exam key -> the source imageIds cached for it. Stack slices belong
// to no volume, so without this registry they could never be evicted.
const stackExamImageIds = new Map();

function stackExamKey(imageIds) {
  return `stack:${imageIds[0]}`;
}

/**
 * Fully remove a cached volume and its backing images.
 *
 * Cornerstone's removeSegmentation()/removeAllSegmentations() only drop tool
 * state — the labelmap volume and its per-slice derived images stay in the
 * cache. cache.removeVolumeLoadObject() alone isn't enough either: it unpins
 * the volume's images (clears their sharedCacheKey) but leaves them counted
 * against the cache limit. So remove the volume first (releasing the pin),
 * then force-remove each backing image.
 */
export function decacheVolume(volumeId) {
  examLastVisited.delete(volumeId);
  const volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) return;
  const imageIds = volume.imageIds ?? [];
  cornerstone.cache.removeVolumeLoadObject(volumeId);
  removeCachedImages(imageIds);
}

export function removeCachedImages(imageIds) {
  imageIds.forEach((imageId) => {
    // Skip images that were never loaded or are already gone.
    if (cornerstone.cache.getImage(imageId)) {
      cornerstone.cache.removeImageLoadObject(imageId, { force: true });
    }
  });
}

function decacheStackExam(examKey) {
  removeCachedImages(stackExamImageIds.get(examKey) ?? []);
  stackExamImageIds.delete(examKey);
  examLastVisited.delete(examKey);
}

/**
 * Per-frame geometry for a not-yet-loaded exam, from the already-cached
 * DICOM metadata. wadouri metadata only exists once the file is parsed, so
 * for a fresh exam this falls back to a full CT frame — over-reserving is
 * safe (worst case one extra old exam gets evicted).
 */
function getFrameGeometry(imageIds) {
  const middleImageId = imageIds[Math.floor(imageIds.length / 2)];
  const pixelModule = metaData.get("imagePixelModule", middleImageId) ?? {};
  const planeModule = metaData.get("imagePlaneModule", middleImageId) ?? {};
  const rows = planeModule.rows ?? pixelModule.rows ?? 512;
  const columns = planeModule.columns ?? pixelModule.columns ?? 512;
  const bytesPerPixel =
    ((pixelModule.bitsAllocated ?? 16) / 8) * (pixelModule.samplesPerPixel ?? 1);
  return { rows, columns, bytesPerPixel };
}

/**
 * Bytes an exam needs: its source slices (unless already cached from a
 * previous visit) plus one Uint8 labelmap of the same dimensions. The 10%
 * margin absorbs estimate slack (metadata gaps, per-image overhead).
 */
function estimateExamBytes(imageIds, sourceAlreadyCached) {
  const { rows, columns, bytesPerPixel } = getFrameGeometry(imageIds);
  const frameBytes = rows * columns;
  const sourceBytes = sourceAlreadyCached
    ? 0
    : imageIds.length * frameBytes * bytesPerPixel;
  const labelmapBytes = imageIds.length * frameBytes;
  return Math.ceil((sourceBytes + labelmapBytes) * 1.1);
}

/**
 * All evictable exams, least-recently-viewed first: cached volumes (derived
 * labelmaps ride along with their parent; orphaned ones are evicted
 * directly) plus registered stack exams. Exams never recorded in
 * examLastVisited sort as oldest.
 */
function listEvictableExams(keepKeys) {
  const volumeExams = cornerstone.cache
    .getVolumes()
    .filter((volume) => volume && !keepKeys.includes(volume.volumeId))
    .filter(
      (volume) =>
        !volume.referencedVolumeId ||
        !cornerstone.cache.getVolume(volume.referencedVolumeId),
    )
    .map((volume) => ({ key: volume.volumeId, kind: "volume" }));
  const stackExams = Array.from(stackExamImageIds.keys())
    .filter((key) => !keepKeys.includes(key))
    .map((key) => ({ key, kind: "stack" }));

  return [...volumeExams, ...stackExams].sort(
    (a, b) =>
      (examLastVisited.get(a.key) ?? 0) - (examLastVisited.get(b.key) ?? 0),
  );
}

function evictExam({ key, kind }) {
  if (kind === "volume") {
    // Not cache.filterVolumesByReferenceId: that reads .referencedVolumeId
    // off every cache entry unguarded, and entries whose load promise hasn't
    // resolved yet (common during fast IEC navigation) still have an
    // undefined volume — it throws and fails the whole exam load.
    cornerstone.cache
      .getVolumes()
      .filter((volume) => volume?.referencedVolumeId === key)
      .forEach((derived) => decacheVolume(derived.volumeId));
    decacheVolume(key);
  } else {
    decacheStackExam(key);
  }
}

function makeRoom(bytesNeeded, keepKeys) {
  if (cornerstone.cache.getBytesAvailable() >= bytesNeeded) return;
  for (const exam of listEvictableExams(keepKeys)) {
    evictExam(exam);
    if (cornerstone.cache.getBytesAvailable() >= bytesNeeded) return;
  }
  // Still not enough room: proceed and let Cornerstone report the failure —
  // this exam is too large for the cache even on its own.
}

/**
 * Record a visit to a volume exam and evict least-recently-viewed exams
 * until it fits in the cache. Exams in keepVolumeIds are never evicted.
 */
export function makeRoomForExam(imageIds, keepVolumeIds) {
  const [volumeId] = keepVolumeIds;
  examLastVisited.set(volumeId, Date.now());
  const sourceAlreadyCached = Boolean(cornerstone.cache.getVolume(volumeId));
  makeRoom(estimateExamBytes(imageIds, sourceAlreadyCached), keepVolumeIds);
}

/**
 * Stack counterpart of makeRoomForExam. Registers the exam's source
 * imageIds so the eviction can free them later — stack slices belong to no
 * volume, and as pinned wadouri images Cornerstone itself never evicts them.
 */
export function makeRoomForStackExam(imageIds) {
  const examKey = stackExamKey(imageIds);
  examLastVisited.set(examKey, Date.now());
  const sourceAlreadyCached =
    stackExamImageIds.has(examKey) &&
    Boolean(cornerstone.cache.getImage(imageIds[0])) &&
    Boolean(cornerstone.cache.getImage(imageIds[imageIds.length - 1]));
  stackExamImageIds.set(examKey, imageIds);
  makeRoom(estimateExamBytes(imageIds, sourceAlreadyCached), [examKey]);
}

// Monotonic token for the most recent exam load. Rapid navigation abandons
// loads mid-flight, but their async completions — volume.load callbacks,
// awaited image loads — still fire afterward, and used to stomp the current
// exam's segmentation state (or throw, if the abandoned volume had been
// LRU-evicted in the meantime). Each loader captures the token and bails out
// of any completion that is no longer the latest load.
let examLoadGeneration = 0;

/**
 * Clone per-frame metadata onto frames whose download failed (e.g. a backend
 * 504). wadouri metadata only exists once a file is parsed, and building the
 * derived labelmap reads rows/columns for every frame of the volume — so a
 * single failed frame used to sink the whole exam's labelmap ("reading
 * 'rows'") and leave it un-maskable. The nearest loaded frame's modules are
 * close enough: the labelmap's geometry comes from the volume itself, and
 * the failed slice simply stays black in the source.
 */
function backfillMissingFrameMetadata(imageIds) {
  const MODULES = [
    "imagePlaneModule",
    "imagePixelModule",
    "generalSeriesModule",
  ];
  const isLoaded = (imageId) =>
    Boolean(metaData.get("imagePlaneModule", imageId));

  const loadedIndices = [];
  imageIds.forEach((imageId, index) => {
    if (isLoaded(imageId)) loadedIndices.push(index);
  });
  if (loadedIndices.length === 0 || loadedIndices.length === imageIds.length) {
    return;
  }

  imageIds.forEach((imageId, index) => {
    if (isLoaded(imageId)) return;
    const donorIndex = loadedIndices.reduce((best, candidate) =>
      Math.abs(candidate - index) < Math.abs(best - index) ? candidate : best,
    );
    console.warn(
      `Frame ${index} failed to load; borrowing metadata from frame ${donorIndex}`,
    );
    MODULES.forEach((type) => {
      const metadata = metaData.get(type, imageIds[donorIndex]);
      if (metadata) {
        cornerstone.utilities.genericMetadataProvider.add(imageId, {
          type,
          metadata,
        });
      }
    });
  });
}

export async function loadVolumeAndSegmentation(
  imageIds,
  volumeId,
  segmentationId,
) {
  const generation = ++examLoadGeneration;

  // Keep previously visited exams cached (instant back-navigation), but evict
  // the least-recently-viewed ones if this exam wouldn't fit.
  makeRoomForExam(imageIds, [volumeId, segmentationId]);

  let loadedFromCache = true;
  let volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) {
    console.log("Volume didn't already exist, creating it");
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    loadedFromCache = false;
  } else {
    // triggerEvent(eventTarget, 'VolumeReallyLoaded', {
    //   volumeId,
    //   segmentationId,
    // });
    console.log("Volume already existed, not creating it");
  }

  // Set the volume to load
  volume.load(() => {
    if (generation !== examLoadGeneration) {
      console.log("Skipping stale volume load completion for", volumeId);
      return;
    }
    if (!cornerstone.cache.getVolume(volumeId)) {
      console.log("Volume evicted before load completed:", volumeId);
      return;
    }

    try {
      csToolsSegmentation.removeAllSegmentations();
      csToolsSegmentation.removeAllSegmentationRepresentations();

      // Frames that failed to download have no metadata; borrow it from
      // their nearest loaded neighbor so one bad frame can't sink the
      // labelmap for the whole exam.
      backfillMissingFrameMetadata(volume.imageIds ?? imageIds);

      // Create a segmentation of the same resolution as the source data for the CT volume
      volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
        volumeId: segmentationId,
      });

      csToolsSegmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            // The type of segmentation
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            // The actual segmentation data, in the case of labelmap this is a
            // reference to the source volume of the segmentation.
            data: {
              volumeId: segmentationId,
            },
          },
        },
      ]);
      // if (loadedFromCache) {
      //   await new Promise((r) => setTimeout(r, 300));
      // }
      triggerEvent(eventTarget, "VolumeReallyLoaded", {
        volumeId,
        segmentationId,
      });

      console.log("Volume loaded:", volumeId);
    } catch (error) {
      // A frame that failed to download (e.g. a backend 504) has no
      // metadata, so building the derived labelmap throws ("reading
      // 'rows'"). Surface it as a load failure instead of an unhandled
      // rejection; the exam stays undrawable but the user can navigate on.
      console.error("Failed to prepare segmentation for", volumeId, error);
      notify.error(error, messages.errors.loadImage);
      // "VolumeReallyLoaded" won't fire for this exam; the UI keeps its
      // loading spinner up until it hears one — tell it the load is over.
      triggerEvent(eventTarget, "VolumeLoadFailed", { volumeId });
    }
  });
  return volume;
}

/**
 * This is a version of loadVolume that returns a Promise that resolves
 * only when the volume is fully loaded.
 *
 * This would allow you to `await loadVolumeAsync(...)` and pause until
 * the volume is loaded.
 */
export function loadVolumeAsync(
  imageIds,
  volumeId,
  segmentationId,
  callback = null,
) {
  return new Promise((resolve) => {
    loadVolume(imageIds, volumeId, segmentationId, (result) => {
      resolve(result);
    });
  });
}

/**
 * Load a volume via WADO-URI
 *
 * @param {Array<string>} imageIds
 * @param {string} volumeId
 * @param {string} segmentationId
 * @param {function} callback
 * @returns
 */
export async function loadVolume(
  imageIds,
  volumeId,
  segmentationId,
  callback = null,
) {
  // Same cache policy as loadVolumeAndSegmentation: keep old exams for
  // instant revisits, evict least-recently-viewed ones when out of room.
  makeRoomForExam(imageIds, [volumeId, segmentationId].filter(Boolean));

  let volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) {
    console.log("Volume didn't already exist, creating it:", volumeId);
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
  } else {
    console.log("Volume already existed, not creating it");
  }

  volume.load(callback);

  return volume;
}

export async function loadVolumeSegmentation(
  imageIds,
  volumeId,
  segmentationId,
) {
  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  // Create a segmentation of the same resolution as the source data for the CT volume
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  csToolsSegmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
}

export async function loadStackSegmentation(imageIds, segmentationId) {
  const generation = ++examLoadGeneration;

  // Same cache policy as loadVolumeAndSegmentation: keep old exams for
  // instant revisits, evict least-recently-viewed ones when out of room.
  makeRoomForStackExam(imageIds);

  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  const results = await Promise.allSettled(
    cornerstone.imageLoader.loadAndCacheImages(imageIds),
  );

  // A newer exam load took over while the frames were loading (rapid
  // navigation); don't create a segmentation for this abandoned one.
  if (generation !== examLoadGeneration) {
    console.log("Skipping stale stack segmentation for", segmentationId);
    return;
  }

  // Create a segmentation of the same resolution as the source data for the CT volume
  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  if (generation !== examLoadGeneration) {
    console.log("Skipping stale stack segmentation for", segmentationId);
    return;
  }

  csToolsSegmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);

  // Signal that the segmentation now exists so the stack viewport can add (and
  // activate) its representation — mirrors loadVolumeAndSegmentation. Adding the
  // representation before this point would race ahead of the segmentation. We
  // use a stack-specific event (not "VolumeReallyLoaded") so a leftover volume
  // viewport listener can't react to it and add a representation to a gone
  // viewport (which renders null and throws).
  triggerEvent(eventTarget, "StackSegmentationReady", { segmentationId });
}

function parseSegMetadata(arrayBuffer) {
  const dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
  const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
    dicomDict.dict,
  );
  const segments = dataset.SegmentSequence;
  const frames = dataset.PerFrameFunctionalGroupsSequence;
  return { dataset, segments, frames };
}

function cielabToRGBA(color) {
  if (!color) {
    return [0, 0, 0, 255]; // Default to black if no color is provided
  }
  const [L, a, b] = color;
  return dcmjs.data.Colors.dicomlab2RGB([L, a, b]).map((val) =>
    Math.round(val * 255),
  );
}

export async function loadSEGSegmentation(
  arrayBuffer,
  referenceImageIds,
  segmentationId,
) {
  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  // Parse the DICOM SEG metadata using adapterSEG
  const adapterRet = await Cornerstone3D.Segmentation.createFromDICOMSegBuffer(
    referenceImageIds,
    arrayBuffer,
    { metadataProvider: metaData },
  );

  const { labelMapImages } = adapterRet;

  // build segmentList from segMetadata
  const segmentList = adapterRet.segMetadata.data.map((seg, i) => {
    if (!seg) {
      // NOTE: This might not always be the case, but in testing
      // so far, DICOM SEG objects seem to have an empty segment
      // at the beginning. This code could fail if the empty segment
      // is somewhere else, not sure.
      //
      // skip is set so in the SegPanel we can skip rendering
      return {
        segmentIndex: i,
        label: `Empty Segment ${i}`,
        description: "Empty Segment",
        visible: false,
        skip: true, // will use this in SegPanel to skip rendering
      };
    }
    let segment = {
      segmentIndex: seg.SegmentNumber ?? i + 1,
      label: seg.SegmentLabel ?? `Segment ${i + 1}`,
      description: seg.SegmentDescription ?? "", // optional, unused?
      color: cielabToRGBA(seg.RecommendedDisplayCIELabValue),
      visible: true,
    };
    return segment;
  });

  // Create a new segmentation object for each entry
  // in the labelMapImages
  const segmentationList = labelMapImages.map((labelMapImage, i) => {
    // Create a segmentation for each labelMapImage
    const newSegmentationId = `${segmentationId}-${i}`;
    csToolsSegmentation.addSegmentations([
      {
        segmentationId: newSegmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: { imageIds: labelMapImage.map((image) => image.imageId) },
        },
        config: {
          segments: segmentList,
        },
      },
    ]);
    return newSegmentationId;
  });

  return {
    segments: segmentList,
    segmentationIds: segmentationList,
  };
}

export async function getImageIdsFromIEC(iec) {
  let imageIds;
  try {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID: `iec:${iec}`,
      SeriesInstanceUID: "any",
      wadoRsRoot: "/papi/v1/wadors",
    });
  } catch (error) {
    console.log(error);
    return;
  }

  return imageIds;
}

export function toAbsoluteURL(relative_url) {
  // There are a few functions in Cornerstone that expect an absolute URL
  // even when they really sould be able to accept a relative one.
  // This is a hacky way to generate an absolute URL from a relative

  let url = new URL(window.location);

  return url.origin + relative_url;
}

export async function getDicomDump(file_id) {
  const response = await fetch(`/papi/v1/dump/${file_id}`);

  const dump = await response.text();

  return dump;
}

export function get3dViewports(renderingEngine) {
  // return all the viewports that have a 3D volume type

  // Get all viewports from the rendering engine
  const viewports = renderingEngine.getViewports();

  // Find 3D viewports
  return viewports.find((viewport) => {
    return viewport.type === cornerstone.Enums.ViewportType.VOLUME_3D;
  });
}

export function fetchFileAsArrayBuffer(fileId) {
  // Fetch a file from the server and return it as an ArrayBuffer
  return fetch(`/papi/v1/files/${fileId}/data`).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    return response.arrayBuffer();
  });
}

/**
 * Converts IJK (index) coordinates to World (physical) coordinates
 * @param {Array} ijkCoords - Array of [i, j, k] coordinates
 * @param {Object} volume - Volume object containing dimensions, origin, spacing, and direction
 * @returns {Array} World coordinates [x, y, z] in physical space
 */
export function ijkToWorld(ijkCoords, volume) {
  const [i, j, k] = ijkCoords;
  const { origin, spacing, direction } = volume;

  // Convert the flat 9-element direction array to a 3x3 matrix
  const directionMatrix = [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]],
  ];

  // Scale by spacing first
  const scaledCoords = [i * spacing[0], j * spacing[1], k * spacing[2]];

  // Apply direction matrix transformation
  const worldCoords = [
    directionMatrix[0][0] * scaledCoords[0] +
      directionMatrix[0][1] * scaledCoords[1] +
      directionMatrix[0][2] * scaledCoords[2] +
      origin[0],
    directionMatrix[1][0] * scaledCoords[0] +
      directionMatrix[1][1] * scaledCoords[1] +
      directionMatrix[1][2] * scaledCoords[2] +
      origin[1],
    directionMatrix[2][0] * scaledCoords[0] +
      directionMatrix[2][1] * scaledCoords[1] +
      directionMatrix[2][2] * scaledCoords[2] +
      origin[2],
  ];

  return worldCoords;
}

/**
 * Converts World (physical) coordinates to IJK (index) coordinates
 * @param {Array} worldCoords - Array of [x, y, z] world coordinates
 * @param {Object} volume - Volume object containing dimensions, origin, spacing, and direction
 * @returns {Array} IJK coordinates [i, j, k] in index space
 */
export function worldToIjk(worldCoords, volume) {
  const [x, y, z] = worldCoords;
  const { origin, spacing, direction } = volume;

  // Convert the flat 9-element direction array to a 3x3 matrix
  const directionMatrix = [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]],
  ];

  // Subtract origin first
  const translatedCoords = [x - origin[0], y - origin[1], z - origin[2]];

  // Apply inverse direction matrix transformation
  // For orthogonal matrices, inverse = transpose
  const physicalCoords = [
    directionMatrix[0][0] * translatedCoords[0] +
      directionMatrix[1][0] * translatedCoords[1] +
      directionMatrix[2][0] * translatedCoords[2],
    directionMatrix[0][1] * translatedCoords[0] +
      directionMatrix[1][1] * translatedCoords[1] +
      directionMatrix[2][1] * translatedCoords[2],
    directionMatrix[0][2] * translatedCoords[0] +
      directionMatrix[1][2] * translatedCoords[1] +
      directionMatrix[2][2] * translatedCoords[2],
  ];

  // Scale by inverse spacing
  const ijkCoords = [
    physicalCoords[0] / spacing[0],
    physicalCoords[1] / spacing[1],
    physicalCoords[2] / spacing[2],
  ];

  return ijkCoords;
}

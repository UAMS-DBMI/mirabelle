import * as cornerstone from "@cornerstonejs/core";

/*
 * Session registry of exams whose source images are currently in the
 * Cornerstone cache — i.e. reopening them is instant. The IEC queue reads this
 * to flag "already loaded" rows.
 *
 * Each exam records a cache "probe" captured when its load finished: the
 * source volumeId (volumes) or the source imageIds (stacks). "Loaded" is not a
 * latch — previously visited exams are evicted least-recently-viewed-first
 * whenever a new exam needs room (see makeRoom in utilities.js). pruneLoaded-
 * Exams() re-checks each probe against the live cache and drops the ones whose
 * data is gone, so the flag never lies about what will actually open instantly.
 */

const probes = new Map(); // idString -> { volumeId?, imageIds?, sizeBytes }

// Immutable snapshot of the loaded ids, only replaced when membership changes,
// so useSyncExternalStore's getSnapshot stays referentially stable.
let idsSnapshot = new Set();
const listeners = new Set();

// Cheap eviction check for pruning. Exams are evicted whole (see the exam LRU
// in utilities.js), so one lookup per exam is enough: the volume object for
// volumes, the first pinned frame for stacks.
function probeInCache(probe) {
  if (probe?.volumeId) {
    return Boolean(cornerstone.cache.getVolume(probe.volumeId));
  }
  const imageIds = probe?.imageIds;
  return Boolean(imageIds?.length && cornerstone.cache.getImage(imageIds[0]));
}

// Strict admission check for marking. "Loaded" must mean COMPLETELY loaded:
// a streaming volume's shell exists in the cache from the first moment (and
// survives a failed stream), so require its loadStatus to say every frame
// arrived; a stack must have every frame in the image cache (a frame whose
// download failed is simply absent).
function probeFullyLoaded(probe) {
  if (probe?.volumeId) {
    const volume = cornerstone.cache.getVolume(probe.volumeId);
    if (!volume) return false;
    // Non-streaming volumes (e.g. nifti) have no loadStatus — for those the
    // volume existing at all means its pixel data is in.
    return !volume.loadStatus || Boolean(volume.loadStatus.loaded);
  }
  const imageIds = probe?.imageIds;
  if (!imageIds?.length) return false;
  return imageIds.every((imageId) => cornerstone.cache.getImage(imageId));
}

// Decoded size of a volume from its geometry. Not volume.sizeInBytes: for
// image-backed volumes that getter derives bytes-per-voxel from a sample
// voxel VALUE (a plain number, whose BYTES_PER_ELEMENT is undefined) and
// returns NaN.
const BYTES_PER_DATA_TYPE = {
  Int8: 1,
  Uint8: 1,
  Int16: 2,
  Uint16: 2,
  Float32: 4,
};

function volumeSizeBytes(volume) {
  const [x, y, z] = volume?.dimensions ?? [];
  const voxels = x * y * z;
  if (!Number.isFinite(voxels) || voxels <= 0) return null;
  return voxels * (BYTES_PER_DATA_TYPE[volume.dataType] ?? 2);
}

// Decoded in-memory size of the exam's source images, read from the cache at
// mark time (when the exam is fully loaded, so the figure is final). This is
// the memory footprint that fills the cache — not the compressed on-disk size.
function examSizeBytes(probe) {
  if (probe?.volumeId) {
    const bytes = volumeSizeBytes(cornerstone.cache.getVolume(probe.volumeId));
    if (bytes) return bytes;
  }
  const imageIds = probe?.imageIds;
  if (!imageIds?.length) return null;
  let total = 0;
  let counted = 0;
  imageIds.forEach((imageId) => {
    const bytes = cornerstone.cache.getImage(imageId)?.sizeInBytes;
    if (Number.isFinite(bytes) && bytes > 0) {
      total += bytes;
      counted += 1;
    }
  });
  return counted ? total : null;
}

function publishIfChanged() {
  const next = new Set(probes.keys());
  if (
    next.size === idsSnapshot.size &&
    [...next].every((id) => idsSnapshot.has(id))
  ) {
    return;
  }
  idsSnapshot = next;
  listeners.forEach((listener) => listener());
}

/** Subscribe to changes in the set of loaded exams; returns an unsubscribe. */
export function subscribeLoadedExams(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable Set of the ids (as strings) whose exam is currently cached. */
export function getLoadedExamIds() {
  return idsSnapshot;
}

/** Whether the given exam's images are currently cached. */
export function isExamLoaded(id) {
  return id != null && probes.has(String(id));
}

/** Decoded cache size of a loaded exam, in bytes, or null if not loaded. */
export function getLoadedExamSizeBytes(id) {
  if (id == null) return null;
  return probes.get(String(id))?.sizeBytes ?? null;
}

/**
 * Record an exam as loaded, keyed by its queue id (IEC / file), with a probe
 * for later eviction checks and its cache size. Ignored unless the probe's
 * data is verifiably ALL in the cache — a mid-stream or partially failed load
 * can't produce a false checkmark.
 */
export function markExamLoaded(id, probe) {
  if (id == null || !probeFullyLoaded(probe)) return;
  const sizeBytes = examSizeBytes(probe);
  probes.set(String(id), {
    ...probe,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
  });
  publishIfChanged();
}

/** Drop exams whose cached data has since been evicted. */
export function pruneLoadedExams() {
  let removed = false;
  for (const [id, probe] of probes) {
    if (!probeInCache(probe)) {
      probes.delete(id);
      removed = true;
    }
  }
  if (removed) publishIfChanged();
}

/**
 * Lets a NIfTI volume draw as its slices arrive, rather than once half of it
 * has.
 *
 * Cornerstone sets a volume's window before drawing it: from the window in the
 * metadata when there is one, otherwise from the range of the middle slice,
 * which it waits for (setDefaultVolumeVOI). A NIfTI file has no window and
 * streams its slices in order, so nothing was drawn until half of the first
 * volume had downloaded. So the volume is given a window in its metadata,
 * where Cornerstone looks first. It follows the range of the slices received
 * so far, and once the middle slice is in, becomes that slice's range: the
 * window Cornerstone would have picked. A window the curator changes in the
 * meantime is left alone.
 */

import {
  Enums,
  cache,
  eventTarget,
  getRenderingEngine,
  utilities,
} from "@cornerstonejs/core";

// The app's one rendering engine (EnableCornerstone).
const RENDERING_ENGINE_ID = "re1";

// Until a slice is in; nothing but black is drawn with it.
const PLACEHOLDER_RANGE = { lower: 0, upper: 1 };

// How often the window follows the slices arriving.
const UPDATE_INTERVAL_MS = 300;

// Middle image ids whose final window (the middle slice's range) is set.
const finalWindows = new Set();

/**
 * Window the volume `volumeId`, made from `imageIds`, while its slices
 * arrive. Call it once the image ids exist, before the viewer shows the
 * volume. Returns a function that stops it.
 *
 * @param {string[]} imageIds
 * @param {string} volumeId
 * @returns {() => void}
 */
export function windowNiftiWhileLoading(imageIds, volumeId) {
  const middleImageId = imageIds[Math.floor(imageIds.length / 2)];
  if (!middleImageId || finalWindows.has(middleImageId)) return () => {};

  const middleImage = cache.getImage(middleImageId);
  if (middleImage) {
    setFinalWindow(middleImageId, imageRange(middleImage));
    return () => {};
  }

  const volumeImageIds = new Set(imageIds);
  // Every window set here, so a viewport showing any of them hasn't had its
  // window changed by the curator.
  const shownRanges = [windowInMetadata(middleImageId) ?? PLACEHOLDER_RANGE];
  setWindowMetadata(middleImageId, shownRanges[0]);
  let receivedRange = null;
  let updateTimer = null;
  let curatorWindowed = false;

  const show = (range) => {
    setWindowMetadata(middleImageId, range);
    shownRanges.push(range);
    if (curatorWindowed) return;
    curatorWindowed = !showOnViewports(volumeId, range, shownRanges);
  };
  const stop = () => {
    eventTarget.removeEventListener(Enums.Events.IMAGE_LOADED, onImageLoaded);
    clearTimeout(updateTimer);
  };
  function onImageLoaded({ detail: { image } }) {
    if (!volumeImageIds.has(image.imageId)) return;
    if (image.imageId === middleImageId) {
      stop();
      finalWindows.add(middleImageId);
      show(imageRange(image));
      return;
    }
    receivedRange = widenRange(receivedRange, imageRange(image));
    if (updateTimer === null) {
      updateTimer = setTimeout(() => {
        updateTimer = null;
        show(receivedRange);
      }, UPDATE_INTERVAL_MS);
    }
  }

  eventTarget.addEventListener(Enums.Events.IMAGE_LOADED, onImageLoaded);
  return stop;
}

function setFinalWindow(middleImageId, range) {
  finalWindows.add(middleImageId);
  setWindowMetadata(middleImageId, range);
}

// The range of an image's values, as Cornerstone takes the middle slice's.
function imageRange(image) {
  let { min, max } = image.voxelManager.getMinMax();
  if (min?.length > 1) {
    min = Math.min(...min);
    max = Math.max(...max);
  }
  return { lower: min, upper: max };
}

function widenRange(range, other) {
  if (!range) return other;
  return {
    lower: Math.min(range.lower, other.lower),
    upper: Math.max(range.upper, other.upper),
  };
}

function windowInMetadata(imageId) {
  const stored = utilities.genericMetadataProvider.get("voiLutModule", imageId);
  if (!stored) return null;
  return utilities.windowLevel.toLowHighRange(
    stored.windowWidth,
    stored.windowCenter,
  );
}

// Where Cornerstone looks for the window first, and where resetting the
// window goes back to.
function setWindowMetadata(imageId, { lower, upper }) {
  const { windowCenter, windowWidth } = utilities.windowLevel.toWindowLevel(
    lower,
    upper,
  );
  utilities.genericMetadataProvider.add(imageId, {
    type: "voiLutModule",
    metadata: { windowCenter, windowWidth },
  });
}

/**
 * Show `range` on the 2D viewports of `volumeId` (the 3D one uses presets),
 * unless the curator has changed the window of one of them: any window not
 * in `shownRanges`. Returns false if so.
 */
function showOnViewports(volumeId, range, shownRanges) {
  const viewports = (
    getRenderingEngine(RENDERING_ENGINE_ID)?.getViewports() ?? []
  ).filter(
    (viewport) =>
      viewport.type === Enums.ViewportType.ORTHOGRAPHIC &&
      viewport.hasVolumeId(volumeId),
  );
  const curatorWindowed = viewports.some((viewport) => {
    const { voiRange } = viewport.getProperties(volumeId);
    return voiRange && !shownRanges.some((shown) => sameRange(shown, voiRange));
  });
  if (curatorWindowed) return false;
  viewports.forEach((viewport) => {
    viewport.setProperties({ voiRange: range }, volumeId);
    viewport.render();
  });
  return true;
}

function sameRange(a, b) {
  const tolerance = 1e-6 * Math.max(1, Math.abs(a.upper - a.lower));
  return (
    Math.abs(a.lower - b.lower) <= tolerance &&
    Math.abs(a.upper - b.upper) <= tolerance
  );
}

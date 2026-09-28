/**
 * Shows a stack frame while its file downloads, so the curator watches it
 * arrive rather than waiting for the whole file: the rows received so far,
 * over black, where the frame will appear. Cornerstone can only show a frame
 * once its file is complete, so this draws the partial frame on a canvas over
 * the viewport, and steps aside once Cornerstone has drawn the real one.
 *
 * The bytes come from lib/dicomFileStreams, which streams the stack's files.
 * Only uncompressed pixel data can be drawn before the file is complete: for
 * compressed files (JPEG and the like) nothing is drawn, and the frame appears
 * once it has loaded, as before.
 */

import * as dicomParser from "dicom-parser";
import { cache, Enums, utilities } from "@cornerstonejs/core";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

import { watchDicomFile } from "@/lib/dicomFileStreams";

const PREVIEW_CLASS = "stack-frame-preview";
const PIXEL_DATA_TAG = "x7fe00010";

// Uncompressed little-endian pixel data (implicit and explicit VR), which can
// be drawn row by row as it arrives.
const STREAMABLE_TRANSFER_SYNTAXES = new Set([
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
]);

const NOT_STREAMABLE = { streamable: false };

// How often the preview is redrawn while bytes arrive.
const REDRAW_INTERVAL_MS = 150;

// RGBA 0, 0, 0, 255 as one little-endian 32-bit pixel.
const OPAQUE_BLACK = 0xff000000;

/**
 * Show each frame `viewport` asks for while its file downloads. Returns a
 * detach function.
 *
 * @param {object} viewport a Cornerstone stack viewport
 * @param {HTMLElement} element its element
 * @param {{initialZoom?: number}} [options] the zoom the viewer sets once the
 *   first frame is up, so the first frame's preview lands where it will be
 * @returns {() => void}
 */
export function attachFramePreview(
  viewport,
  element,
  { initialZoom = 1 } = {},
) {
  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = PREVIEW_CLASS;
  element.appendChild(previewCanvas);

  let preview = null;
  const onPreStackNewImage = (event) => {
    preview?.stop();
    preview = previewFrame(
      viewport,
      previewCanvas,
      event.detail.imageId,
      initialZoom,
    );
  };
  const onStackNewImage = (event) => preview?.frameShown(event.detail.imageId);
  const onImageRendered = () => preview?.viewportRendered();

  const { PRE_STACK_NEW_IMAGE, STACK_NEW_IMAGE, IMAGE_RENDERED } =
    Enums.Events;
  element.addEventListener(PRE_STACK_NEW_IMAGE, onPreStackNewImage);
  element.addEventListener(STACK_NEW_IMAGE, onStackNewImage);
  element.addEventListener(IMAGE_RENDERED, onImageRendered);

  return () => {
    preview?.stop();
    element.removeEventListener(PRE_STACK_NEW_IMAGE, onPreStackNewImage);
    element.removeEventListener(STACK_NEW_IMAGE, onStackNewImage);
    element.removeEventListener(IMAGE_RENDERED, onImageRendered);
    previewCanvas.remove();
  };
}

// Draw `imageId` over the viewport as its file arrives, until the viewport
// has drawn the real frame.
function previewFrame(viewport, previewCanvas, imageId, initialZoom) {
  const { url, frame: frameIndex = 0 } = wadouri.parseImageId(imageId);
  let download = null;
  let layout = null;
  let headerError = null;
  let frame = null;
  let paintedRows = 0;
  let paintedLook = null;
  let receivedRange = null;
  let redrawTimer = null;
  let realFrameShown = false;
  let unwatch = () => {};

  function stop() {
    unwatch();
    clearTimeout(redrawTimer);
    redrawTimer = null;
    download = null;
    frame = null;
    previewCanvas.style.display = "none";
  }

  function redraw() {
    redrawTimer = null;
    if (!layout && !readLayout()) return;
    const rows = rowsReceived(layout, download.length);
    if (rows <= paintedRows) return;
    paintNewRows(rows);
    // Shown before drawing: the canvas is sized from its laid-out size.
    previewCanvas.style.display = "block";
    draw(
      previewCanvas,
      frame.canvas,
      frameTransform(viewport, layout, initialZoom),
    );
  }

  // Read the frame's layout once its header is in. False until then, and
  // for a frame that can't be drawn before its file is complete (it stops).
  function readLayout() {
    const read = readFrameLayout(
      download.bytes.subarray(0, download.length),
      frameIndex,
    );
    if (!read.layout) {
      headerError = read.error;
      return false;
    }
    if (!read.layout.streamable) {
      stop();
      return false;
    }
    layout = read.layout;
    frame = createFrameCanvas(layout);
    return true;
  }

  function paintNewRows(rows) {
    const newSamples = rowSamples(layout, download.bytes, paintedRows, rows);
    let look = null;
    if (layout.samplesPerPixel === 1) {
      receivedRange = widenRange(receivedRange, valueRange(layout, newSamples));
      look = frameLook(viewport, layout, receivedRange);
    }
    if (paintedRows > 0 && !sameLook(look, paintedLook)) {
      // The shading changed: redo the rows already drawn with it.
      const allSamples = rowSamples(layout, download.bytes, 0, rows);
      paintRows(frame, layout, allSamples, 0, look);
    } else {
      paintRows(frame, layout, newSamples, paintedRows, look);
    }
    paintedRows = rows;
    paintedLook = look;
  }

  if (!cache.getImage(imageId)) {
    unwatch = watchDicomFile(url, (latest) => {
      if (latest.failed) {
        stop();
        return;
      }
      download = latest;
      if (redrawTimer === null) {
        redrawTimer = setTimeout(redraw, REDRAW_INTERVAL_MS);
      }
    });
  }

  return {
    stop,
    // Cornerstone has the real frame; the preview goes once it's drawn.
    frameShown(shownImageId) {
      if (shownImageId !== imageId) return;
      realFrameShown = true;
      if (download && !layout && headerError) {
        console.warn(
          "[stackFramePreview] couldn't read the header of",
          url,
          headerError,
        );
      }
    },
    viewportRendered() {
      if (realFrameShown) stop();
    },
  };
}

/**
 * How to draw frame `frameIndex` from the start of its file: `{ layout }`,
 * or `{ layout: null, error }` while the header is still arriving. For pixel
 * data that can't be drawn before the file is complete, `layout.streamable`
 * is false.
 */
function readFrameLayout(bytes, frameIndex) {
  const metaHeader = readArrived(() => dicomParser.readPart10Header(bytes));
  if (metaHeader.error) return { layout: null, error: metaHeader.error };
  const transferSyntax = metaHeader.value.string("x00020010");
  if (!STREAMABLE_TRANSFER_SYNTAXES.has(transferSyntax)) {
    return { layout: NOT_STREAMABLE };
  }
  const header = readArrived(() =>
    dicomParser.parseDicom(bytes, { untilTag: PIXEL_DATA_TAG }),
  );
  if (header.error) return { layout: null, error: header.error };
  return { layout: frameLayout(header.value, frameIndex) };
}

// Reads from a file still arriving: `{ value }`, or `{ error }` when `read`
// runs past the bytes in so far (dicom-parser throws), to try again later.
function readArrived(read) {
  try {
    return { value: read() };
  } catch (error) {
    return { error };
  }
}

// The layout of a frame from the header, or null if the pixel data's own
// header hasn't arrived.
function frameLayout(dataSet, frameIndex) {
  const pixelData = dataSet.elements[PIXEL_DATA_TAG];
  if (!pixelData) return null;
  const rows = dataSet.uint16("x00280010");
  const columns = dataSet.uint16("x00280011");
  const samplesPerPixel = dataSet.uint16("x00280002") ?? 1;
  const bitsAllocated = dataSet.uint16("x00280100");
  const photometric = dataSet.string("x00280004");
  const numberOfFrames = dataSet.intString("x00280008") ?? 1;
  const drawable =
    isDrawableGrayscale(samplesPerPixel, bitsAllocated, photometric) ||
    isDrawableColor(dataSet, samplesPerPixel, bitsAllocated, photometric);
  if (!rows || !columns || !drawable || frameIndex >= numberOfFrames) {
    return NOT_STREAMABLE;
  }
  const bytesPerSample = bitsAllocated / 8;
  const frameBytes = rows * columns * samplesPerPixel * bytesPerSample;
  return {
    streamable: true,
    rows,
    columns,
    samplesPerPixel,
    bytesPerSample,
    signed: dataSet.uint16("x00280103") === 1,
    monochrome1: photometric === "MONOCHROME1",
    slope: finiteOr(dataSet.floatString("x00281053"), 1),
    intercept: finiteOr(dataSet.floatString("x00281052"), 0),
    headerWindow: headerWindow(dataSet),
    pixelSpacing: pixelSpacing(dataSet),
    frameOffset: pixelData.dataOffset + frameIndex * frameBytes,
  };
}

// A header number, or `fallback` when it's absent or empty (NaN).
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isDrawableGrayscale(samplesPerPixel, bitsAllocated, photometric) {
  return (
    samplesPerPixel === 1 &&
    (bitsAllocated === 8 || bitsAllocated === 16) &&
    (photometric === "MONOCHROME1" || photometric === "MONOCHROME2")
  );
}

// 8-bit RGB with each pixel's samples together (planar configuration 0).
function isDrawableColor(dataSet, samplesPerPixel, bitsAllocated, photometric) {
  return (
    samplesPerPixel === 3 &&
    bitsAllocated === 8 &&
    photometric === "RGB" &&
    (dataSet.uint16("x00280006") ?? 0) === 0
  );
}

// The header's first window, as the viewport opens with it.
function headerWindow(dataSet) {
  const center = dataSet.floatString("x00281050", 0);
  const width = dataSet.floatString("x00281051", 0);
  if (!Number.isFinite(center) || !Number.isFinite(width)) return null;
  return utilities.windowLevel.toLowHighRange(width, center);
}

// [row spacing, column spacing]: only their ratio matters to the drawing.
function pixelSpacing(dataSet) {
  for (const tag of ["x00280030", "x00181164"]) {
    const rowSpacing = dataSet.floatString(tag, 0);
    const columnSpacing = dataSet.floatString(tag, 1);
    if (rowSpacing > 0 && columnSpacing > 0) return [rowSpacing, columnSpacing];
  }
  return [1, 1];
}

function rowByteCount(layout) {
  return layout.columns * layout.samplesPerPixel * layout.bytesPerSample;
}

function rowsReceived(layout, length) {
  const rows = Math.floor((length - layout.frameOffset) / rowByteCount(layout));
  return Math.min(Math.max(rows, 0), layout.rows);
}

// The samples of rows [fromRow, toRow), copied out so the typed array starts
// on an aligned offset.
function rowSamples(layout, bytes, fromRow, toRow) {
  const start = layout.frameOffset + fromRow * rowByteCount(layout);
  const end = layout.frameOffset + toRow * rowByteCount(layout);
  const { buffer } = bytes.slice(start, end);
  if (layout.bytesPerSample === 2) {
    return layout.signed ? new Int16Array(buffer) : new Uint16Array(buffer);
  }
  return layout.signed ? new Int8Array(buffer) : new Uint8Array(buffer);
}

// The range of the frame's values (after rescale) among `samples`.
function valueRange(layout, samples) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i] < min) min = samples[i];
    if (samples[i] > max) max = samples[i];
  }
  const ends = [
    min * layout.slope + layout.intercept,
    max * layout.slope + layout.intercept,
  ];
  return { lower: Math.min(...ends), upper: Math.max(...ends) };
}

function widenRange(range, other) {
  if (!range) return other;
  return {
    lower: Math.min(range.lower, other.lower),
    upper: Math.max(range.upper, other.upper),
  };
}

// How to shade a grayscale frame: with the viewport's window and invert when
// it's showing a frame (the curator may have changed them), else the header's
// window, else the range of the values so far, as Cornerstone falls back to
// the frame's range.
function frameLook(viewport, layout, receivedRange) {
  if (viewport.getImageData()) {
    const { voiRange, invert } = viewport.getProperties();
    if (voiRange) return { ...voiRange, invert: Boolean(invert) };
  }
  const { lower, upper } = layout.headerWindow ?? receivedRange;
  return { lower, upper, invert: layout.monochrome1 };
}

function sameLook(a, b) {
  if (a === null || b === null) return a === b;
  return a.lower === b.lower && a.upper === b.upper && a.invert === b.invert;
}

// The frame at one canvas pixel per image pixel, black where rows haven't
// arrived yet.
function createFrameCanvas({ rows, columns }) {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(columns, rows);
  new Uint32Array(imageData.data.buffer).fill(OPAQUE_BLACK);
  context.putImageData(imageData, 0, 0);
  return { canvas, context, imageData };
}

// Shade rows from `fromRow` (as many as `samples` holds) into the frame.
function paintRows(frame, layout, samples, fromRow, look) {
  const pixels = frame.imageData.data;
  let out = fromRow * layout.columns * 4;
  if (layout.samplesPerPixel === 3) {
    for (let i = 0; i < samples.length; i += 3) {
      pixels[out] = samples[i];
      pixels[out + 1] = samples[i + 1];
      pixels[out + 2] = samples[i + 2];
      out += 4;
    }
  } else {
    const { lower, upper, invert } = look;
    const scale = upper > lower ? 255 / (upper - lower) : 0;
    for (let i = 0; i < samples.length; i += 1) {
      const value = samples[i] * layout.slope + layout.intercept;
      const gray = (value - lower) * scale;
      // A Uint8ClampedArray rounds and clamps to 0–255.
      pixels[out] = pixels[out + 1] = pixels[out + 2] = invert
        ? 255 - gray
        : gray;
      out += 4;
    }
  }
  const rowCount = samples.length / (layout.columns * layout.samplesPerPixel);
  frame.context.putImageData(
    frame.imageData,
    0,
    0,
    0,
    fromRow,
    layout.columns,
    rowCount,
  );
}

// Where the frame goes on the viewport's canvas: a canvas transform (CSS px)
// of frame pixel coordinates, pixel (0, 0) covering [0, 1] x [0, 1].
function frameTransform(viewport, layout, initialZoom) {
  const shown = viewport.getImageData();
  const [columns, rows] = shown?.dimensions ?? [];
  const sameSize = columns === layout.columns && rows === layout.rows;
  if (sameSize && typeof shown.imageData?.indexToWorld === "function") {
    return transformOfShownFrame(viewport, shown.imageData);
  }
  return transformOfFirstFrame(viewport, layout, initialZoom);
}

// A frame the size of the one on screen takes its place, whatever the zoom,
// pan or rotation.
function transformOfShownFrame(viewport, imageData) {
  // Pixel (i, j) is centred on index (i, j), so its corner is half a pixel
  // before.
  const toCanvas = (x, y) =>
    viewport.worldToCanvas(
      imageData.indexToWorld([x - 0.5, y - 0.5, 0], [0, 0, 0]),
    );
  const [x0, y0] = toCanvas(0, 0);
  const [x1, y1] = toCanvas(1, 0);
  const [x2, y2] = toCanvas(0, 1);
  return [x1 - x0, y1 - y0, x2 - x0, y2 - y0, x0, y0];
}

// Where the first frame will be. The viewport's resetCamera fits the frame's
// pixel centres into the canvas, with a margin of insetImageMultiplier, and
// centres pixel floor(size / 2); the viewer then zooms to initialZoom.
function transformOfFirstFrame(viewport, layout, initialZoom) {
  const { clientWidth: canvasWidth, clientHeight: canvasHeight } =
    viewport.canvas;
  const [rowSpacing, columnSpacing] = layout.pixelSpacing;
  const worldWidth = Math.max(layout.columns - 1, 1) * columnSpacing;
  const worldHeight = Math.max(layout.rows - 1, 1) * rowSpacing;
  const widthScale = worldWidth / worldHeight / (canvasWidth / canvasHeight);
  const parallelScale =
    (viewport.insetImageMultiplier * worldHeight * Math.max(widthScale, 1)) /
    2;
  const pixelsPerWorldUnit = (canvasHeight * initialZoom) / (2 * parallelScale);
  const columnStep = columnSpacing * pixelsPerWorldUnit;
  const rowStep = rowSpacing * pixelsPerWorldUnit;
  return [
    columnStep,
    0,
    0,
    rowStep,
    canvasWidth / 2 - (Math.floor(layout.columns / 2) + 0.5) * columnStep,
    canvasHeight / 2 - (Math.floor(layout.rows / 2) + 0.5) * rowStep,
  ];
}

function draw(previewCanvas, frameCanvas, [a, b, c, d, e, f]) {
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(previewCanvas.clientWidth * scale);
  const height = Math.round(previewCanvas.clientHeight * scale);
  if (previewCanvas.width !== width) previewCanvas.width = width;
  if (previewCanvas.height !== height) previewCanvas.height = height;
  const context = previewCanvas.getContext("2d");
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.setTransform(
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    e * scale,
    f * scale,
  );
  context.drawImage(frameCanvas, 0, 0);
}

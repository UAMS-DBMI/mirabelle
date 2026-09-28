/**
 * Streams the files of a stack exam, so the viewer can show a frame while its
 * file is still downloading (lib/stackFramePreview).
 *
 * The DICOM loader downloads a file with one XHR and sees none of it until the
 * last byte is in. So streamStackImages starts each stack file's download here
 * first: a fetch whose body is read as it arrives, waiting in the same queue
 * as the loader's own requests (lib/examDownloads). The loader's dataset cache
 * shares one download per URL, so the loader's load of the file joins this
 * one and gets the whole file at the end, as before. Meanwhile, anyone
 * watching the URL sees the bytes received so far.
 */

import { cache } from "@cornerstonejs/core";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

import { queueDownload } from "@/lib/examDownloads";

// A download's buffer when the server sends no Content-Length; it doubles as
// needed.
const INITIAL_BUFFER_BYTES = 1024 * 1024;

// Downloads in progress, by URL: { bytes, length, total, failed }, updated in
// place as bytes arrive. The file so far is the first `length` of `bytes`.
const downloads = new Map();
// Listeners by URL. Kept apart from the downloads, so a file can be watched
// before its download starts (it may be waiting in the queue).
const watchers = new Map();
// Files streamDicomFile has started and that aren't in yet. A multi-frame
// file is asked for once per frame.
const startedUrls = new Set();

/**
 * Stream the file `imageId` is read from, unless the image is loading or
 * loaded, or its file already is. Call it just before loading the image, so
 * the image load joins this download.
 *
 * @param {string} imageId a wadouri image id
 */
export function streamDicomFile(imageId) {
  if (cache.getImageLoadObject(imageId)) return;
  const { url } = wadouri.parseImageId(imageId);
  const { dataSetCacheManager } = wadouri;
  if (startedUrls.has(url) || dataSetCacheManager.isLoaded(url)) return;
  startedUrls.add(url);
  dataSetCacheManager
    .load(url, downloadStreamed, imageId)
    .then(
      // This load only chooses how the file downloads: the image loads that
      // join it hold the dataset. Drop this load's hold once the file is in,
      // so the dataset is still freed along with their images.
      () => dataSetCacheManager.unload(url),
      (error) =>
        console.warn("[dicomFileStreams] download failed", url, error),
    )
    .finally(() => startedUrls.delete(url));
}

/**
 * Call `listener` with the download of `url` whenever more of it arrives,
 * until the returned function is called. It is called at once if the
 * download is under way.
 *
 * The listener gets `{ bytes, length, total, failed }`, updated in place: the
 * file so far is the first `length` of `bytes`, `total` is the file's size if
 * the server sent it (else null), and `failed` is set, with a last call, if
 * the download fails.
 *
 * @param {string} url
 * @param {(download: {bytes: Uint8Array, length: number, total: ?number, failed: boolean}) => void} listener
 * @returns {() => void} stops watching
 */
export function watchDicomFile(url, listener) {
  if (!watchers.has(url)) watchers.set(url, new Set());
  watchers.get(url).add(listener);
  const download = downloads.get(url);
  if (download) listener(download);
  return () => {
    const urlWatchers = watchers.get(url);
    urlWatchers?.delete(listener);
    if (urlWatchers?.size === 0) watchers.delete(url);
  };
}

/**
 * Count how many of the frames `imageIds` have arrived, for the loading
 * indicator: a frame counts 1 once its load has settled (tell `frameSettled`),
 * and before that the share of its file received so far, when the server
 * sent the file's size. So the count moves while large files arrive, not only
 * as each one finishes. Calls `onChange` with the count; `stop` when done.
 *
 * @param {string[]} imageIds
 * @param {(framesArrived: number) => void} onChange
 * @returns {{frameSettled: (imageId: string) => void, stop: () => void}}
 */
export function trackFramesArrived(imageIds, onChange) {
  const urlOf = (imageId) => wadouri.parseImageId(imageId).url;
  // Frames not settled yet, and the share of the file in, by file.
  const pendingFrames = new Map();
  const fileShares = new Map();
  imageIds.forEach((imageId) => {
    const url = urlOf(imageId);
    pendingFrames.set(url, (pendingFrames.get(url) ?? 0) + 1);
  });
  let settledFrames = 0;
  // The pending frames' file shares, summed.
  let partialFrames = 0;

  const unwatchers = [...pendingFrames.keys()].map((url) =>
    watchDicomFile(url, ({ length, total }) => {
      if (!total) return;
      const share = Math.min(length / total, 1);
      partialFrames +=
        (share - (fileShares.get(url) ?? 0)) * pendingFrames.get(url);
      fileShares.set(url, share);
      onChange(settledFrames + partialFrames);
    }),
  );

  return {
    frameSettled(imageId) {
      const url = urlOf(imageId);
      partialFrames -= fileShares.get(url) ?? 0;
      pendingFrames.set(url, pendingFrames.get(url) - 1);
      settledFrames += 1;
      onChange(settledFrames + partialFrames);
    },
    stop() {
      unwatchers.forEach((unwatch) => unwatch());
    },
  };
}

// The dataset cache's `loadRequest`: resolves with the whole file.
function downloadStreamed(url) {
  return queueDownload(url, () => fetchStreamed(url));
}

async function fetchStreamed(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Couldn't download ${url}: HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("Content-Length"));
  const total = contentLength > 0 ? contentLength : null;
  const download = {
    bytes: new Uint8Array(total ?? INITIAL_BUFFER_BYTES),
    length: 0,
    total,
    failed: false,
  };
  downloads.set(url, download);
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      append(download, value);
      notifyWatchers(url, download);
    }
  } catch (error) {
    download.failed = true;
    notifyWatchers(url, download);
    throw error;
  } finally {
    downloads.delete(url);
  }
  return wholeFile(download);
}

function append(download, chunk) {
  const length = download.length + chunk.length;
  if (length > download.bytes.length) {
    // A Content-Length can undercount, e.g. for a compressed response.
    const grown = new Uint8Array(Math.max(length, download.bytes.length * 2));
    grown.set(download.bytes.subarray(0, download.length));
    download.bytes = grown;
  }
  download.bytes.set(chunk, download.length);
  download.length = length;
}

// The file as the loader expects it: an ArrayBuffer of exactly its bytes.
function wholeFile({ bytes, length }) {
  const { buffer } = bytes;
  return length === buffer.byteLength ? buffer : buffer.slice(0, length);
}

// A watcher that throws must not end the download it's watching.
function notifyWatchers(url, download) {
  watchers.get(url)?.forEach((listener) => {
    try {
      listener(download);
    } catch (error) {
      console.error("[dicomFileStreams] watcher failed", url, error);
    }
  });
}

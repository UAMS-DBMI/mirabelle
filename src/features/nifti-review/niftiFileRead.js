/**
 * Tracks how each NIfTI file's download ended.
 *
 * The (patched) nifti-volume-loader streams a whole file, showing its first
 * volume slice by slice as it arrives, and fires NIFTI_FILE_READ once: when the
 * file has been read to the end (after NIFTI_VOLUME_TRUNCATED if it is
 * damaged), or when it fails to load (too large for the browser, an HTTP or
 * network error, not a NIfTI file). Only then is it known whether the file is
 * intact, so the page keeps its spinner up until this fires.
 *
 * Revisits are served from Cornerstone's cache without a new download, so the
 * outcome is recorded per URL: a file already read reports so right away, and
 * a failed one is forgotten so the next visit downloads it again.
 */

import { eventTarget } from "@cornerstonejs/core";
import { Enums as NiftiEnums } from "@cornerstonejs/nifti-volume-loader";

import { messages } from "@/lib/messages";
import { toPercent } from "@/lib/loadingProgress";

const outcomeByUrl = new Map();
const watchers = new Set();

eventTarget.addEventListener(NiftiEnums.Events.NIFTI_FILE_READ, (event) => {
  outcomeByUrl.set(event.detail.url, event.detail);
  watchers.forEach((watcher) => watcher(event.detail));
});

/**
 * Call `onRead({ error })` once the file at `url` has been read to the end
 * (`error` is null) or has failed to load. Fires right away for a file read
 * earlier. Returns a function that stops watching.
 *
 * @param {string} url Absolute NIfTI URL, as passed to the loader.
 * @param {(outcome: {url: string, error: Error | null}) => void} onRead
 * @returns {() => void}
 */
export function watchNiftiFileRead(url, onRead) {
  const watcher = (outcome) => {
    if (outcome.url === url) onRead(outcome);
  };
  watchers.add(watcher);

  const known = outcomeByUrl.get(url);
  if (known) onRead(known);

  return () => watchers.delete(watcher);
}

/**
 * Call `onPercent(percent)` as the file at `url` downloads, each time the
 * whole-number percentage changes. Measured on decoded bytes against the size
 * the NIfTI header declares, since the file server may send no
 * Content-Length; the download byte count is only a fallback until the header
 * is in. Returns a function that stops watching.
 *
 * @param {string} url Absolute NIfTI URL, as passed to the loader.
 * @param {(percent: number) => void} onPercent
 * @returns {() => void}
 */
export function watchNiftiDownloadProgress(url, onPercent) {
  let lastPercent = null;
  const listener = (event) => {
    const { data } = event.detail;
    // The header fetch fires this event too, keyed by volumeId, not url.
    if (data?.url !== url) return;
    const percent = downloadPercent(data);
    if (percent === null || percent === lastPercent) return;
    lastPercent = percent;
    onPercent(percent);
  };
  const { NIFTI_VOLUME_PROGRESS } = NiftiEnums.Events;
  eventTarget.addEventListener(NIFTI_VOLUME_PROGRESS, listener);
  return () => eventTarget.removeEventListener(NIFTI_VOLUME_PROGRESS, listener);
}

// Clamped by toPercent: a file with bytes past its image data runs over 100%.
function downloadPercent({ decoded, decodedTotal, loaded, total }) {
  if (decodedTotal) return toPercent(decoded, decodedTotal);
  if (total) return toPercent(loaded, total);
  return null;
}

/**
 * Whether an earlier load of the file at `url` failed, forgetting it. A failed
 * volume stays cached without pixel data and reports itself loaded, so the
 * caller should remove it from the cache and load the file again.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function takeNiftiLoadFailure(url) {
  if (!outcomeByUrl.get(url)?.error) return false;
  outcomeByUrl.delete(url);
  return true;
}

/**
 * The headline for a failed load. The patched loader names volumes too large
 * for the browser, which no retry will fix.
 *
 * @param {Error} error
 * @returns {string}
 */
export function niftiLoadFailureMessage(error) {
  return error?.name === "NiftiTooLargeError"
    ? messages.errors.niftiTooLarge
    : messages.errors.loadImage;
}

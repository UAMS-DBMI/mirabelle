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

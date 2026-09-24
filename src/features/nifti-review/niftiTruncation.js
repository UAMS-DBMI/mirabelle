/**
 * Tracks NIfTI files the loader could only partially decode.
 *
 * The (patched) nifti-volume-loader shows whatever a truncated or corrupt
 * .nii.gz still decodes to and fires NIFTI_VOLUME_TRUNCATED once per fetch.
 * Revisits are served from cache without refetching, so the event would not
 * fire again. Recording each damaged URL here lets every visit warn the
 * curator, not just the first.
 */

import { eventTarget } from "@cornerstonejs/core";
import { Enums as NiftiEnums } from "@cornerstonejs/nifti-volume-loader";

const truncatedByUrl = new Map();
const watchers = new Set();

eventTarget.addEventListener(
  NiftiEnums.Events.NIFTI_VOLUME_TRUNCATED,
  (event) => {
    truncatedByUrl.set(event.detail.url, event.detail);
    watchers.forEach((watcher) => watcher(event.detail));
  },
);

/**
 * Call `onTruncated(detail)` if the file at `url` is (or turns out to be)
 * damaged. Fires right away for a file already known to be damaged. Returns
 * a function that stops watching.
 *
 * @param {string} url Absolute NIfTI URL, as passed to the loader.
 * @param {(detail: {url: string, reason: string, recoveredFraction: number}) => void} onTruncated
 * @returns {() => void}
 */
export function watchNiftiTruncation(url, onTruncated) {
  const watcher = (detail) => {
    if (detail.url === url) onTruncated(detail);
  };
  watchers.add(watcher);

  const known = truncatedByUrl.get(url);
  if (known) onTruncated(known);

  return () => watchers.delete(watcher);
}

/**
 * Build the error shown to the curator: a friendly message, with the decoder's
 * reason (e.g. "unexpected EOF") and how much image data survived as detail.
 *
 * @param {{reason: string, recoveredFraction: number}} detail
 * @param {string} userMessage
 * @returns {Error}
 */
export function truncationError(detail, userMessage) {
  const error = new Error(
    `${detail.reason} · ${describeRecovered(detail.recoveredFraction)}`,
  );
  error.userMessage = userMessage;
  return error;
}

function describeRecovered(fraction) {
  if (fraction >= 1) return "all image data recovered";
  // Round down so a file missing a sliver never claims 100%.
  const percent = Math.floor(fraction * 1000) / 10;
  return `${percent}% of image data recovered`;
}

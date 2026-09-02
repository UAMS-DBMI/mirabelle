/**
 * Global safety net for errors that escape component-level handling.
 *
 * Some failures originate deep inside async libraries (e.g. Cornerstone's
 * surface/segmentation render pipeline) and surface as unhandled promise
 * rejections that a local try/catch can't reach. This routes those through the
 * unified toast system instead of letting them blow up as raw runtime errors.
 *
 * Install once at startup (see index.js).
 */

import { notify } from "./notify";
import { messages } from "./messages";

let installed = false;

// Errors from a viewport that was torn down while an async library call was
// still in flight. Cornerstone reads the camera off a renderer that navigation
// has already destroyed, and the message names the camera accessor it tripped
// on ("Cannot read properties of null (reading 'getViewUp')", and the Firefox /
// Safari phrasings of the same null access).
//
// These are unreachable from our code: cornerstone-tools' segmentation render
// loop fires on a requestAnimationFrame and never awaits the per-representation
// render promises, so a rejection there escapes as an unhandled rejection no
// caller can catch. Rapid IEC navigation hits this routinely, and the work it
// abandons belongs to an exam that is already off screen — so log it for
// debugging rather than telling the curator something went wrong.
const TORN_DOWN_VIEWPORT_ACCESSORS = [
  "getViewUp",
  "getViewPlaneNormal",
  "getParallelScale",
];

function isTornDownViewportError(error) {
  const message = typeof error === "string" ? error : error?.message;
  if (!message) return false;
  return TORN_DOWN_VIEWPORT_ACCESSORS.some((accessor) =>
    message.includes(accessor),
  );
}

// Avoid spamming identical toasts when the same error fires repeatedly
// (e.g. once per viewport during a render).
const recent = new Map();
const DEDUPE_MS = 4000;

function report(error) {
  if (!error) return;

  if (isTornDownViewportError(error)) {
    console.warn("[errors] ignoring torn-down viewport error", error);
    return;
  }

  // Failed image downloads (e.g. backend 504s on the file server) reject
  // with {error: XMLHttpRequest} deep inside the image loader, where no
  // caller can catch them. Report those as image-load failures under a
  // single dedupe key — a flaky exam can fail many frames at once.
  const isImageDownloadFailure =
    typeof XMLHttpRequest !== "undefined" &&
    (error instanceof XMLHttpRequest || error?.error instanceof XMLHttpRequest);

  const key = isImageDownloadFailure
    ? "image-download-failure"
    : (typeof error === "string" && error) ||
      error.userMessage ||
      error.message ||
      String(error);

  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);

  // notify.error logs the raw error and shows a friendly message + detail.
  notify.error(
    error,
    isImageDownloadFailure
      ? messages.errors.framesFailed
      : messages.errors.generic,
  );
}

export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (event) => {
    report(event?.reason);
  });

  window.addEventListener("error", (event) => {
    // Ignore resource-load errors (<img>, <script>, …) which carry no .error.
    if (!event?.error) return;
    report(event.error);
  });
}

export default installGlobalErrorHandlers;

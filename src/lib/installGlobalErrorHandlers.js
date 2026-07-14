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

// Avoid spamming identical toasts when the same error fires repeatedly
// (e.g. once per viewport during a render).
const recent = new Map();
const DEDUPE_MS = 4000;

function report(error) {
  if (!error) return;

  const key =
    (typeof error === "string" && error) ||
    error.userMessage ||
    error.message ||
    String(error);

  // Known, harmless Cornerstone bug: updateSurfaceData throws this when a
  // selection is drawn after Expand. Masking still works, so don't show a
  // toast for it — just leave a breadcrumb in the console.
  if (key.includes("reading 'segmentationId'")) {
    console.warn("[suppressed]", error);
    return;
  }

  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);

  // notify.error logs the raw error and shows a friendly message + detail.
  notify.error(error, messages.errors.generic);
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

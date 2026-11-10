/**
 * Notification facade over react-hot-toast.
 *
 * All transient user feedback should go through `notify` so that durations,
 * styling, and error handling stay consistent across the app. Use this instead
 * of importing `toast` directly or calling the browser's `alert()`.
 *
 * Visual styling (including light/dark theming) lives in notifications.css and
 * is wired up once on the <Toaster> in AppLayout. Per-type accents are applied
 * here via stable class names so CSS stays in charge of appearance.
 */

import React from "react";
import toast from "react-hot-toast";

import { messages } from "./messages";

const DURATION = {
  success: 2500,
  // Errors stay until the user dismisses them or moves to another image.
  error: Infinity,
  info: 3500,
};

// Transient non-error toasts (success / info) occupy a single "slot": a new one
// dismisses the toast currently in the slot — so react-hot-toast plays that
// box's exit animation — while the new one mounts and plays its entrance
// animation. The whole box visibly leaves as the replacement arrives, with no
// in-place text swap. Errors and loading toasts are exempt: errors require
// manual dismissal, and loading toasts are tied to a specific async op.
const NON_ERROR_TOAST_ID = "app-non-error-toast";

let nonErrorSeq = 0; // makes each slot toast id unique
let activeSlotId = null; // id of the toast most recently put in the slot

// Error objects already shown as a toast. Cornerstone reports some failures
// twice: once through an event a page can act on, and again as an unhandled
// rejection. The global handler checks this so the curator sees one toast.
const shownErrors = new WeakSet();

// Errors raised while an image (an IEC or a NIfTI file) was on screen, by image,
// oldest first. They come back with the image until the curator clears them. In
// memory only, so a refresh starts over: a server's text can end up in an error's
// detail, which shouldn't be written to the browser's storage.
const errorsByImage = new Map();

// Keys of the lasting errors (notify.imageError) the curator has cleared.
const clearedErrors = new Set();

// The image on screen, or null on a page without one, whose errors aren't saved
// and stay until dismissed.
let currentImage = null;

// Error toasts on screen, newest first, which is also top to bottom. Tracked here
// rather than read with useToasterStore: in react-hot-toast 2.6.0, a subscriber
// that unmounts removes the first subscriber instead of itself. That is the
// <Toaster>, and every toast then stops updating.
let errorsOnScreen = [];
const onScreenListeners = new Set();

/**
 * Show a non-error toast in the shared slot. `show(id)` performs the actual
 * `toast.*` call with the given (unique) id. Dismissing a stale/expired id is a
 * harmless no-op, so the slot needs no expiry bookkeeping. Returns the id.
 *
 * With `keepPrevious`, the current toast is left to finish its own duration
 * and the two show together — for a follow-up that must not hide what came
 * just before it.
 */
function showInSlot(show, { keepPrevious = false } = {}) {
  if (activeSlotId != null && !keepPrevious) {
    toast.dismiss(activeSlotId); // animate the current box out
  }
  const id = `${NON_ERROR_TOAST_ID}-${++nonErrorSeq}`;
  activeSlotId = id;
  show(id); // new box animates in
  return id;
}

// Info toasts use react-hot-toast's plain variant, which has no icon, so we
// supply one (Material Symbols font, colored via the --toast-info token).
const INFO_ICON = React.createElement(
  "span",
  {
    className: "material-symbols-outlined app-toast__info-icon",
    "aria-hidden": "true",
  },
  "info",
);

/**
 * Resolve any thrown value to a friendly, user-safe string.
 * Prefers an ApiError's `userMessage`, then a plain string, then a generic
 * fallback. Avoids leaking raw stack traces / internal messages to the UI.
 */
function toUserMessage(error, fallback = messages.errors.generic) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.userMessage) return error.userMessage;
  return fallback;
}

/**
 * Extract a short technical detail to show beneath the friendly message:
 * HTTP status + server response for an ApiError, or the raw message for a
 * plain Error. Returns null when there's nothing useful (or it would just
 * duplicate the friendly message). Truncated so toasts stay compact.
 */
function toErrorDetail(error) {
  if (!error || typeof error === "string") return null;

  const parts = [];
  if (error.status) parts.push(`HTTP ${error.status}`);

  const raw =
    (typeof error.detail === "string" && error.detail.trim()) ||
    error.cause?.message ||
    error.message;
  if (raw && raw !== error.userMessage) parts.push(raw);

  if (parts.length === 0) return null;
  const text = parts.join(" · ").replace(/\s+/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function setErrorsOnScreen(entries) {
  errorsOnScreen = entries;
  onScreenListeners.forEach((listener) => listener());
}

function subscribeToErrorsOnScreen(listener) {
  onScreenListeners.add(listener);
  return () => onScreenListeners.delete(listener);
}

function showErrorToast(entry) {
  entry.toastId = toast.error(errorToastContent(entry), {
    duration: DURATION.error,
    className: "app-toast app-toast--error",
  });
  setErrorsOnScreen([entry, ...errorsOnScreen]);
}

function hideErrorToast(entry) {
  toast.dismiss(entry.toastId);
  setErrorsOnScreen(errorsOnScreen.filter((shown) => shown !== entry));
}

/** The curator is done with this error: off the screen, and off its image. */
function clearError(entry) {
  hideErrorToast(entry);
  if (entry.image === null) return;
  errorsByImage.set(
    entry.image,
    errorsByImage.get(entry.image).filter((saved) => saved !== entry),
  );
  if (entry.lasting) clearedErrors.add(entry.key);
}

/**
 * "Clear all" on the newest error toast, while two or more errors are showing.
 * The toasts on screen are the current image's, so it clears them for this image
 * only. Loading toasts and the timed success and info ones are left alone.
 */
function ClearAllErrors({ entry }) {
  const onScreen = React.useSyncExternalStore(
    subscribeToErrorsOnScreen,
    () => errorsOnScreen,
  );
  if (onScreen.length < 2 || onScreen[0] !== entry) return null;

  return React.createElement(
    "button",
    {
      type: "button",
      className: "app-toast__clear-all",
      onClick: () => onScreen.forEach(clearError),
    },
    messages.toasts.clearAllErrors(onScreen.length),
  );
}

// The message (plus optional muted detail), Clear all, and a close button.
function errorToastContent(entry) {
  return React.createElement(
    "div",
    { className: "app-toast__content" },
    React.createElement(
      "div",
      { className: "app-toast__text" },
      React.createElement("div", null, entry.message),
      entry.detail
        ? React.createElement(
            "div",
            { className: "app-toast__detail" },
            entry.detail,
          )
        : null,
      React.createElement(ClearAllErrors, { entry }),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "app-toast__close",
        "aria-label": "Dismiss",
        onClick: () => clearError(entry),
      },
      "×",
    ),
  );
}

// Whether this image already has this error on record, so it needs no new toast:
// pages raise their load errors again on every visit. A curator's clear only
// holds for lasting errors; anything else happening again is a new failure.
function isAlreadyKnown(entry) {
  if (entry.image === null) return false;
  if (entry.lasting && clearedErrors.has(entry.key)) return true;
  const saved = errorsByImage.get(entry.image) ?? [];
  return saved.some((other) => other.key === entry.key);
}

function saveError(entry) {
  if (entry.image === null) return;
  const saved = errorsByImage.get(entry.image) ?? [];
  errorsByImage.set(entry.image, [...saved, entry]);
}

/**
 * Log an error and show it, unless its image already has it on record. The raw
 * error goes to the console for debugging; the user only sees a friendly message.
 */
function raiseError(error, fallback, lasting) {
  if (error && typeof error !== "string") {
    console.error("[notify]", error);
  }
  if (error && typeof error === "object") {
    shownErrors.add(error);
  }
  const message = toUserMessage(error, fallback || messages.errors.generic);
  const detail = toErrorDetail(error);
  const entry = {
    image: currentImage,
    key: `${currentImage}\n${message}\n${detail}`,
    message,
    detail,
    lasting,
    toastId: null,
  };

  if (isAlreadyKnown(entry)) return null;
  saveError(entry);
  showErrorToast(entry);
  return entry.toastId;
}

export const notify = {
  success(message, { keepPrevious, ...options } = {}) {
    return showInSlot(
      (id) =>
        toast.success(message, {
          duration: DURATION.success,
          className: "app-toast app-toast--success",
          ...options,
          id,
        }),
      { keepPrevious },
    );
  },

  info(message, { keepPrevious, ...options } = {}) {
    return showInSlot(
      (id) =>
        toast(message, {
          duration: DURATION.info,
          className: "app-toast app-toast--info",
          icon: INFO_ICON,
          ...options,
          id,
        }),
      { keepPrevious },
    );
  },

  loading(message, options) {
    return toast.loading(message, {
      className: "app-toast app-toast--loading",
      ...options,
    });
  },

  dismiss(id) {
    errorsOnScreen
      .filter((entry) => id === undefined || entry.toastId === id)
      .forEach(clearError);
    return toast.dismiss(id);
  },

  /**
   * Show an error toast. Accepts an Error/ApiError/string. Raised while an image
   * is on screen, it's saved with that image (see showErrorsFor).
   *
   * @param {unknown} error
   * @param {string} [fallback] Friendly message when `error` has none.
   */
  error(error, fallback) {
    return raiseError(error, fallback, false);
  },

  /**
   * Show an error about the image itself, which pages raise on every visit (a
   * damaged file, say). Unlike notify.error, it stays gone once the curator has
   * cleared it for this image. Don't use it for an action that failed: that has
   * to show every time it happens.
   *
   * @param {unknown} error
   * @param {string} [fallback] Friendly message when `error` has none.
   */
  imageError(error, fallback) {
    return raiseError(error, fallback, true);
  },

  /**
   * Switch the error toasts to `image`, the IEC or NIfTI file now on screen, or
   * null on a page without one (useErrorsPerImage). The last image's errors leave
   * the screen and this one's come back.
   *
   * @param {string | null} image
   */
  showErrorsFor(image) {
    if (image === currentImage) return;
    errorsOnScreen
      .filter((entry) => entry.image !== null)
      .forEach(hideErrorToast);
    currentImage = image;
    (errorsByImage.get(image) ?? []).forEach(showErrorToast);
  },

  /**
   * Whether `error` (the same object) was already shown by `notify.error`.
   *
   * @param {unknown} error
   * @returns {boolean}
   */
  wasShown(error) {
    return (
      Boolean(error) && typeof error === "object" && shownErrors.has(error)
    );
  },

  /**
   * Treat `error` (the same object) as already shown, without a toast: for an
   * error a page handled on screen in its own way, so the global handler
   * doesn't toast it when it also escapes as an unhandled rejection.
   *
   * @param {unknown} error
   */
  markHandled(error) {
    if (error && typeof error === "object") shownErrors.add(error);
  },
};

export default notify;

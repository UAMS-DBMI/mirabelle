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
  // Errors stay until the user dismisses them via the close button.
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

/**
 * Show a non-error toast in the shared slot. `show(id)` performs the actual
 * `toast.*` call with the given (unique) id. Dismissing a stale/expired id is a
 * harmless no-op, so the slot needs no expiry bookkeeping. Returns the id.
 */
function showInSlot(show) {
  if (activeSlotId != null) {
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

export const notify = {
  success(message, options) {
    return showInSlot((id) =>
      toast.success(message, {
        duration: DURATION.success,
        className: "app-toast app-toast--success",
        ...options,
        id,
      }),
    );
  },

  info(message, options) {
    return showInSlot((id) =>
      toast(message, {
        duration: DURATION.info,
        className: "app-toast app-toast--info",
        icon: INFO_ICON,
        ...options,
        id,
      }),
    );
  },

  loading(message, options) {
    return toast.loading(message, {
      className: "app-toast app-toast--loading",
      ...options,
    });
  },

  dismiss(id) {
    return toast.dismiss(id);
  },

  /**
   * Show an error toast. Accepts an Error/ApiError/string. The raw error is
   * logged to the console for debugging; the user only sees a friendly message.
   *
   * @param {unknown} error
   * @param {string} [fallback] Friendly message when `error` has none.
   */
  error(error, fallback) {
    if (error && typeof error !== "string") {
      console.error("[notify]", error);
    }
    const message = toUserMessage(error, fallback || messages.errors.generic);
    const detail = toErrorDetail(error);

    // Render the message (plus optional muted detail) alongside a close button
    // so the user can dismiss the error manually. The render fn receives the
    // toast instance `t`, giving us its id for dismissal.
    const content = (t) =>
      React.createElement(
        "div",
        { className: "app-toast__content" },
        React.createElement(
          "div",
          { className: "app-toast__text" },
          React.createElement("div", null, message),
          detail
            ? React.createElement(
                "div",
                { className: "app-toast__detail" },
                detail,
              )
            : null,
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "app-toast__close",
            "aria-label": "Dismiss",
            onClick: () => toast.dismiss(t.id),
          },
          "×",
        ),
      );

    return toast.error(content, {
      duration: DURATION.error,
      className: "app-toast app-toast--error",
    });
  },
};

export default notify;

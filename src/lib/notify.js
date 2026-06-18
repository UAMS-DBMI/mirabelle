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
  error: 5000,
  info: 3500,
};

// Info toasts use react-hot-toast's plain variant, which has no icon, so we
// supply one (Material Symbols font, colored via the --toast-info token).
const INFO_ICON = React.createElement(
  "span",
  { className: "material-symbols-outlined app-toast__info-icon", "aria-hidden": "true" },
  "info"
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

export const notify = {
  success(message, options) {
    return toast.success(message, {
      duration: DURATION.success,
      className: "app-toast app-toast--success",
      ...options,
    });
  },

  info(message, options) {
    return toast(message, {
      duration: DURATION.info,
      className: "app-toast app-toast--info",
      icon: INFO_ICON,
      ...options,
    });
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
    return toast.error(message, {
      duration: DURATION.error,
      className: "app-toast app-toast--error",
    });
  },
};

export default notify;

import React from "react";

import { messages } from "@/lib/messages";
import "./ViewportPlaceholder.css";

/**
 * Neutral, muted placeholder shown in an image viewport when there is nothing
 * to display (e.g. a load failed, or no item is selected).
 *
 * Deliberately NOT styled as an error: actual failures are surfaced to the
 * user as toasts, so the viewport itself stays clean.
 *
 * @param {object} props
 * @param {string} [props.message]
 */
export default function ViewportPlaceholder({ message = messages.viewport.noImage }) {
  return (
    <div className="viewport-placeholder">
      <span className="viewport-placeholder__icon material-symbols-outlined" aria-hidden="true">
        image
      </span>
      <p className="viewport-placeholder__message">{message}</p>
    </div>
  );
}

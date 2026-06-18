import React from "react";

import { messages } from "@/lib/messages";
import "./ErrorState.css";

/**
 * Full-page fallback UI for fatal error situations (router errors, the
 * top-level ErrorBoundary). This is intentionally NOT used inside image
 * viewports — load failures there are surfaced as toasts instead.
 *
 * @param {object} props
 * @param {string} [props.title]   Headline. Defaults to a friendly "Oops!".
 * @param {string} [props.message] Body text. Defaults to the generic error.
 * @param {string} [props.detail]  Optional technical detail (monospace).
 * @param {() => void} [props.onRetry] If provided, renders a "Try again" button.
 */
export default function ErrorState({
  title = "Oops!",
  message = messages.errors.generic,
  detail,
  onRetry,
}) {
  return (
    <div className="error-state" role="alert">
      <h1 className="error-state__title">{title}</h1>
      <p className="error-state__message">{message}</p>
      {detail ? <pre className="error-state__detail">{detail}</pre> : null}
      {onRetry ? (
        <button className="error-state__retry" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

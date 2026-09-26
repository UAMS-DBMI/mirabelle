import React from "react";

import "./LoadingSpinner.css";

/**
 * The loading indicator: a spinning ring, with the percentage loaded inside
 * it when known. It can show in several places at once (the viewer panel, the
 * app-wide overlay, a route's fallback), so it is styled by class, not id.
 *
 * @param {object} props
 * @param {number | null} [props.progress] Percent loaded, 0–100, shown inside
 *   the ring; omitted or null when unknown.
 */
export default function LoadingSpinner({ progress = null }) {
  return (
    <div className="loading-spinner" role="status">
      {/* The ring spins on its own layer so the percentage stays upright. */}
      <div className="loading-spinner__ring">
        <div className="loading-spinner__arc"></div>
        {progress !== null && (
          <span className="loading-spinner__progress">{progress}%</span>
        )}
      </div>
      <p className="loading-spinner__label">Loading...</p>
    </div>
  );
}

/**
 * The indicator centred in the page, for a route whose data is still loading
 * (the router's HydrateFallback).
 */
export function LoadingPage() {
  return (
    <div className="loading-page">
      <LoadingSpinner />
    </div>
  );
}

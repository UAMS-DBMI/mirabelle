import React from "react";

import "./LoadingSpinner.css";

/**
 * @param {object} props
 * @param {number | null} [props.progress] Percent loaded, 0–100, shown inside
 *   the ring; omitted or null when unknown.
 */
export default function LoadingSpinner({ progress = null }) {
  return (
    <div id="loading-spinner" role="status">
      {/* The ring spins on its own layer so the percentage stays upright. */}
      <div id="spinner-ring">
        <div id="spinner"></div>
        {progress !== null && <span id="progress">{progress}%</span>}
      </div>
      <p id="description">Loading...</p>
    </div>
  );
}

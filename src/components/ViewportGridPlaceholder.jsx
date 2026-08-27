/**
 * Empty viewport panes shown in the middle panel while an exam's images are
 * still loading. Mirrors the real viewer's grid (2×2 for a volume, a single
 * pane for a stack) so the layout appears instantly — the app-wide spinner
 * floats above it — and the real viewports slot in without a layout jump.
 *
 * It also fills the middle panel's first grid row, keeping the operations bar
 * pinned to its own row instead of stretching to full height.
 */
import React from "react";

import "./ViewportGridPlaceholder.css";

export default function ViewportGridPlaceholder({ single = false }) {
  const paneCount = single ? 1 : 4;
  return (
    <div className={`viewport-grid-placeholder${single ? " single" : ""}`}>
      {Array.from({ length: paneCount }).map((_, index) => (
        <div key={index} className="viewport-grid-placeholder__pane" />
      ))}
    </div>
  );
}

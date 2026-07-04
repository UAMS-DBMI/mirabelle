import React from "react";

import "./QCViewerToolbar.css";

/**
 * Viewer tool row: primary mouse tool toggle (window/level vs pan), zoom
 * controls and reset. The wheel always scrolls through the stack and the
 * right mouse button always zooms; only the primary-drag tool changes.
 */
export default function QCViewerToolbar({
  activeTool,
  onToolChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
}) {
  const zoomLabel = zoom != null ? `${Math.round(zoom * 100)}%` : "—";

  return (
    <div id="qc-viewer-toolbar">
      <div className="qc-tool-toggle">
        <button
          className={activeTool === "wl" ? "active" : ""}
          onClick={() => onToolChange("wl")}
        >
          Window / Level
        </button>
        <button
          className={activeTool === "pan" ? "active" : ""}
          onClick={() => onToolChange("pan")}
        >
          Pan
        </button>
      </div>

      <div className="qc-toolbar-divider" />

      <button
        className="qc-btn qc-zoom-btn"
        title="Zoom out"
        onClick={onZoomOut}
      >
        −
      </button>
      <div className="qc-zoom-label">{zoomLabel}</div>
      <button className="qc-btn qc-zoom-btn" title="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button className="qc-btn" onClick={onResetView}>
        Reset view
      </button>

      <div className="qc-toolbar-spacer" />

      <div className="qc-toolbar-hint">
        Drag to adjust {activeTool === "wl" ? "window/level" : "pan"} · scroll
        to change frame
      </div>
    </div>
  );
}

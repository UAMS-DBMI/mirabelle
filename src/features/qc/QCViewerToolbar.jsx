import React from "react";

import { messages } from "@/lib/messages";

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
  showLabels,
  onToggleLabels,
  downloadUrl,
}) {
  const zoomLabel = zoom != null ? `${Math.round(zoom * 100)}%` : "—";

  return (
    <div id="qc-viewer-toolbar">
      <div className="qc-tool-toggle">
        <button
          className={activeTool === "wl" ? "qc-active" : ""}
          onClick={() => onToolChange("wl")}
        >
          Window / Level
        </button>
        <button
          className={activeTool === "pan" ? "qc-active" : ""}
          onClick={() => onToolChange("pan")}
        >
          Pan
        </button>
      </div>

      <div className="qc-toolbar-divider" />

      <div className="qc-zoom-group">
        <button title="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <div className="qc-zoom-label">{zoomLabel}</div>
        <button title="Zoom in" onClick={onZoomIn}>
          +
        </button>
      </div>
      <button className="qc-btn" onClick={onResetView}>
        Reset view
      </button>

      <div className="qc-toolbar-spacer" />

      <div className="qc-toolbar-hint">
        Drag to adjust {activeTool === "wl" ? "window/level" : "pan"} · scroll
        to change frame
      </div>

      <button
        className={`qc-btn qc-labels-toggle${showLabels ? " qc-active" : ""}`}
        aria-pressed={showLabels}
        title={showLabels ? "Hide image labels" : "Show image labels"}
        onClick={onToggleLabels}
      >
        Labels
      </button>

      {downloadUrl ? (
        <a className="qc-btn qc-download" href={downloadUrl} download>
          Download
        </a>
      ) : (
        <button
          className="qc-btn"
          disabled
          title={messages.qc.downloadReadOnly}
        >
          Download
        </button>
      )}
    </div>
  );
}

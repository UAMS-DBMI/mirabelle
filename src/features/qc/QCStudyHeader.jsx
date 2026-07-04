import React, { useState } from "react";

import "./QCStudyHeader.css";

const STATUS_PILLS = {
  pending: { label: "Pending Review", className: "qc-pill-neutral" },
  approved: { label: "Approved", className: "qc-pill-green" },
  rejected: { label: "Rejected", className: "qc-pill-red" },
  flagged: { label: "Flagged", className: "qc-pill-amber" },
};

const SHORTCUTS = [
  ["Play / pause", "Space"],
  ["Step frame", "← →"],
  ["Zoom in / out", "+ / −"],
  ["Approve / Reject / Flag", "A / R / F"],
  ["Next / previous series", "Tab / ⇧Tab"],
];

/**
 * Patient/study strip at the top of the QC page. The demographics come from
 * the displayed frame's DICOM tags, so they show placeholders until the
 * first image of the series has loaded.
 */
export default function QCStudyHeader({ studyInfo, series }) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  // No pill without a selected series (end-of-list or empty filter results).
  const status = series
    ? STATUS_PILLS[series.qc_status] || STATUS_PILLS.pending
    : null;
  const modality = studyInfo?.modality || series?.modality || "—";

  return (
    <div id="qc-study-header">
      <div className="qc-header-block">
        <div className="qc-header-primary">{studyInfo?.patientName || "—"}</div>
        <div className="qc-header-secondary">
          {studyInfo?.patientId || "—"} · {studyInfo?.patientSex || "—"},{" "}
          {studyInfo?.patientAge || "—"}
        </div>
      </div>

      <div className="qc-header-divider" />

      <div className="qc-header-block">
        <div className="qc-header-primary">
          {studyInfo?.studyDescription || "—"}
        </div>
        <div className="qc-header-secondary">
          Acc# {studyInfo?.accession || "—"} ·{" "}
          {studyInfo?.seriesDescription || "—"} · {modality}
        </div>
      </div>

      <div className="qc-header-spacer" />

      {status && (
        <div className={`qc-pill ${status.className}`}>{status.label}</div>
      )}

      <div className="qc-shortcuts">
        <button
          className="qc-btn"
          onClick={() => setShowShortcuts((value) => !value)}
        >
          <span className="qc-shortcuts-icon">⌨</span> Shortcuts
        </button>
        {showShortcuts && (
          <div className="qc-shortcuts-popover">
            <div className="qc-section-heading">Keyboard Shortcuts</div>
            {SHORTCUTS.map(([action, keys]) => (
              <div key={action} className="qc-shortcut-row">
                <span>{action}</span>
                <b>{keys}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

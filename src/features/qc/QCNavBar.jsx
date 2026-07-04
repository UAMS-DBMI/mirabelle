import React from "react";

import "./QCNavBar.css";

const QC_STATUS_OPTIONS = ["All", "pending", "approved", "rejected", "flagged"];

// [qc_status, pill label suffix, pill color class]
const COUNT_PILLS = [
  ["pending", "remaining", "qc-pill-neutral"],
  ["approved", "approved", "qc-pill-green"],
  ["rejected", "rejected", "qc-pill-red"],
  ["flagged", "flagged", "qc-pill-amber"],
];

function statusCounts(seriesByStatus) {
  const counts = { pending: 0, approved: 0, rejected: 0, flagged: 0 };
  for (const row of seriesByStatus || []) {
    if (counts[row.qc_status] !== undefined) {
      counts[row.qc_status] += row.count;
    }
  }
  return counts;
}

/**
 * Assignment-level strip: series navigation, position within the filtered
 * list, the qc_status/modality filters, and the assignment's progress pills
 * (from the series_by_status rollup).
 */
export default function QCNavBar({
  position,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  qcStatus,
  modality,
  modalityOptions,
  onFilter,
  seriesByStatus,
}) {
  const counts = statusCounts(seriesByStatus);

  return (
    <div id="qc-nav-bar">
      <button className="qc-btn" disabled={!hasPrevious} onClick={onPrevious}>
        ← Back
      </button>
      <button className="qc-btn" disabled={!hasNext} onClick={onNext}>
        Forward →
      </button>

      <div className="qc-nav-position">
        Series {position ?? "–"} of {total ?? "–"}
      </div>

      <label className="qc-nav-filter">
        <span>Status:</span>
        <select
          id="filter-qc-status"
          value={qcStatus}
          onChange={(e) => onFilter({ qcStatus: e.target.value, modality })}
        >
          {QC_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="qc-nav-filter">
        <span>Modality:</span>
        <select
          id="filter-modality"
          value={modality}
          onChange={(e) => onFilter({ qcStatus, modality: e.target.value })}
        >
          {modalityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="qc-nav-spacer" />

      <div className="qc-nav-pills">
        {COUNT_PILLS.map(([status, label, className]) => (
          <div key={status} className={`qc-pill ${className}`}>
            {counts[status]} {label}
          </div>
        ))}
      </div>
    </div>
  );
}

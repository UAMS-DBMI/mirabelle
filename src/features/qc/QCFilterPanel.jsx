import React, { useState, useEffect } from "react";

// Reuse the shared filter-panel styling (keyed on the #filter-panel id).
import "@/components/FilterPanel.css";

const QC_STATUS_OPTIONS = ["All", "pending", "approved", "rejected", "flagged"];

/**
 * QC-specific filter controls: qc_status and modality. Both filter
 * server-side via the series list endpoint; "All" means no filter.
 */
export default function QCFilterPanel({
  qcStatus: initialQcStatus,
  modality: initialModality,
  modalityOptions = ["All"],
  onAction,
}) {
  const [qcStatus, setQcStatus] = useState(initialQcStatus || "All");
  const [modality, setModality] = useState(initialModality || "All");

  // Keep state in sync if route props change
  useEffect(() => {
    setQcStatus(initialQcStatus || "All");
  }, [initialQcStatus]);
  useEffect(() => {
    setModality(initialModality || "All");
  }, [initialModality]);

  const handleFilter = () => {
    if (onAction) {
      onAction({ qcStatus, modality });
    }
  };

  const submitOnEnter = (e) => {
    if (e.key === "Enter") handleFilter();
  };

  return (
    <div id="filter-panel">
      <label>
        <span>QC Status:</span>
        <select
          id="filter-qc-status"
          value={qcStatus}
          onChange={(e) => setQcStatus(e.target.value)}
          onKeyDown={submitOnEnter}
        >
          {QC_STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Modality:</span>
        <select
          id="filter-modality"
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          onKeyDown={submitOnEnter}
        >
          {modalityOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>

      <button onClick={handleFilter}>Filter</button>
    </div>
  );
}

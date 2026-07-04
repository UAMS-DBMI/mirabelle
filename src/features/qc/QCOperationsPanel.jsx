import React from "react";

import { messages } from "@/lib/messages";

import "./QCOperationsPanel.css";

/**
 * QC action buttons (Approve / Reject / Flag) plus the shared note field.
 * Reject and Flag require a note and stay disabled until one is typed;
 * Approve treats it as optional. The button matching the series' saved
 * status is highlighted. In read-only mode (assignment belongs to someone
 * else) all actions are disabled but the rest of the route stays usable.
 */
export default function QCOperationsPanel({
  series,
  readOnly,
  assignedTo,
  note,
  onNoteChange,
  noteInputRef,
  onAction,
}) {
  const noteMissing = !note.trim();
  const status = series?.qc_status;

  const buttonClass = (action, colorClass) =>
    `qc-review-button ${colorClass}${status === action ? " active" : ""}`;

  return (
    <div id="qc-review-panel">
      <div className="qc-section-heading">Stack Review</div>

      {readOnly && assignedTo != null && (
        <p className="qc-readonly-notice">{messages.qc.readOnly(assignedTo)}</p>
      )}

      <textarea
        id="qc-note"
        ref={noteInputRef}
        value={note}
        rows={3}
        placeholder="Add a note about this series…"
        disabled={readOnly}
        onChange={(e) => onNoteChange(e.target.value)}
      />
      <div className="qc-note-hint">
        Optional for Approve · required for Reject / Flag
      </div>

      <div className="qc-review-buttons">
        <button
          id="qc-approve"
          className={buttonClass("approved", "qc-review-green")}
          disabled={readOnly}
          onClick={() => onAction("approved")}
        >
          ✓ Approve
        </button>
        <button
          id="qc-reject"
          className={buttonClass("rejected", "qc-review-red")}
          disabled={readOnly || noteMissing}
          onClick={() => onAction("rejected")}
        >
          ✕ Reject
        </button>
        <button
          id="qc-flag"
          className={buttonClass("flagged", "qc-review-amber")}
          disabled={readOnly || noteMissing}
          onClick={() => onAction("flagged")}
        >
          ⚑ Flag
        </button>
      </div>

      <div className="qc-review-hint">
        Deciding advances to the next series in this assignment.
      </div>
    </div>
  );
}

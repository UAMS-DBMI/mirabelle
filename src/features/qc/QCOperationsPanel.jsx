import React from "react";
import { useSelector } from "react-redux";

import { messages } from "@/lib/messages";

import "./QCOperationsPanel.css";

/**
 * QC action buttons (Approve / Reject / Flag) plus the shared note field.
 * Reject and Flag require a note; Approve treats it as optional. In
 * read-only mode (assignment belongs to someone else) the actions are
 * disabled but the rest of the route stays usable.
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
  const buttonConfig = useSelector((state) => state.presentation.buttonConfig);
  const visibility = buttonConfig.qc.visibility;

  return (
    <div id="qc-operations-panel" className="side-panel">
      <h2 id="title">QC Operations</h2>
      <div className="wrapper">
        {series && (
          <div className="qc-series-info">
            <p>
              <span>Series:</span> {series.series_instance_uid}
            </p>
            <p>
              <span>Modality:</span> {series.modality}
            </p>
            <p>
              <span>Status:</span> {series.qc_status}
            </p>
            {series.notes && (
              <p>
                <span>Notes:</span> {series.notes}
              </p>
            )}
          </div>
        )}

        {readOnly && assignedTo != null && (
          <p className="qc-readonly-notice">
            {messages.qc.readOnly(assignedTo)}
          </p>
        )}

        <textarea
          id="qc-note"
          ref={noteInputRef}
          value={note}
          rows={3}
          placeholder="Note (required for Reject and Flag)"
          disabled={readOnly}
          onChange={(e) => onNoteChange(e.target.value)}
        />

        <div className="qc-buttons">
          {visibility.approve && (
            <button
              id="qc-approve"
              disabled={readOnly}
              onClick={() => onAction("approved")}
            >
              Approve
            </button>
          )}
          {visibility.reject && (
            <button
              id="qc-reject"
              disabled={readOnly}
              onClick={() => onAction("rejected")}
            >
              Reject
            </button>
          )}
          {visibility.flag && (
            <button
              id="qc-flag"
              disabled={readOnly}
              onClick={() => onAction("flagged")}
            >
              Flag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

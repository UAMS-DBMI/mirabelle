import React from "react";

import "./QCProgressHeader.css";

const STATUS_ORDER = ["pending", "approved", "rejected", "flagged"];

/**
 * Compact always-visible progress indicator built from the assignment's
 * series_by_status rollup, e.g. `104 pending | 1 rejected | 105 total`.
 */
export default function QCProgressHeader({ seriesByStatus }) {
  if (!Array.isArray(seriesByStatus)) {
    return null;
  }

  const counts = {};
  let total = 0;
  for (const row of seriesByStatus) {
    counts[row.qc_status] = (counts[row.qc_status] || 0) + row.count;
    total += row.count;
  }

  const parts = STATUS_ORDER.filter((status) => counts[status]).map(
    (status) => `${counts[status]} ${status}`,
  );
  parts.push(`${total} total`);

  return (
    <div id="qc-progress-header">
      {parts.map((part, index) => (
        <React.Fragment key={part}>
          {index > 0 && <span className="qc-progress-separator">|</span>}
          <span className="qc-progress-count">{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

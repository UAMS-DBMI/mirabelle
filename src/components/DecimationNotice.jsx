import React from "react";
import { useSelector } from "react-redux";
import { messages } from "@/lib/messages";

import "./DecimationNotice.css";

function wasDecimated(frameCounts) {
  return Boolean(frameCounts) && frameCounts.shown < frameCounts.total;
}

/**
 * The status line shown under the Decimate control while its input is
 * hovered (see ToolsPanel.css).
 *
 * - Slices skipped on this exam: an amber PHI warning with the counts. An
 *   exam with fewer frames than the decimate count is untouched, and the load
 *   limit can skip slices even when Decimate is 0.
 * - Decimate is 0 and nothing skipped: a calm "Decimate is off" line.
 * - Decimate is set but the series is within it: a calm "none hidden" line.
 */
export default function DecimationNotice({ frameCounts }) {
  const decimate = useSelector((state) => state.options.decimate);

  if (wasDecimated(frameCounts)) {
    const { shown, total } = frameCounts;
    return (
      <NoticeCallout
        variant="is-skipping"
        icon="warning"
        title={messages.decimation.slicesShown(shown, total)}
        detail={messages.decimation.slicesHidden(total - shown)}
      />
    );
  }

  if (decimate === 0) {
    return (
      <NoticeCallout
        variant="is-off"
        icon="check_circle"
        title={messages.decimation.offTitle}
        detail={
          frameCounts
            ? messages.decimation.offAllShown(frameCounts.total)
            : messages.decimation.offNoExam
        }
      />
    );
  }

  if (frameCounts) {
    const { shown, total } = frameCounts;
    return (
      <NoticeCallout
        variant="is-all-shown"
        icon="check_circle"
        title={messages.decimation.slicesShown(shown, total)}
        detail={messages.decimation.noneHidden}
      />
    );
  }

  return null;
}

function NoticeCallout({ variant, icon, title, detail }) {
  return (
    <div className={`decimation-notice ${variant}`} role="status">
      <span className="material-symbols-rounded" aria-hidden="true">
        {icon}
      </span>
      <div className="decimation-notice-body">
        <p className="decimation-notice-title">{title}</p>
        <p className="decimation-notice-detail">{detail}</p>
      </div>
    </div>
  );
}

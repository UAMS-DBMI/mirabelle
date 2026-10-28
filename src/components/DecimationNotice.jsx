import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { messages } from "@/lib/messages";
import { decimateRangeForStep, framesKeptAtStep } from "@/utilities";

import "./DecimationNotice.css";

const DETAILS_GAP_PX = 12;

function wasDecimated(frameCounts) {
  return Boolean(frameCounts) && frameCounts.shown < frameCounts.total;
}

/**
 * The status line under the Decimate control. Hovering it explains how
 * Decimate works.
 *
 * - Slices skipped on this exam: an amber PHI warning with the counts. An
 *   exam with fewer frames than the decimate count is untouched, and the load
 *   limit can skip slices even when Decimate is 0.
 * - Decimate is 0 and nothing skipped: a calm "Decimate is off" line.
 * - Decimate is set but nothing skipped: nothing, so curators going through
 *   thousands of exams see the warning rarely enough to keep reading it.
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
        frameCounts={frameCounts}
        isUserChosen={decimate > 0}
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
        frameCounts={frameCounts}
        isUserChosen={false}
      />
    );
  }

  return null;
}

function NoticeCallout({
  variant,
  icon,
  title,
  detail,
  frameCounts,
  isUserChosen,
}) {
  const [anchor, setAnchor] = useState(null);

  return (
    <div
      className={`decimation-notice ${variant}`}
      role="status"
      onMouseEnter={(event) =>
        setAnchor(event.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => setAnchor(null)}
    >
      <span className="material-symbols-rounded" aria-hidden="true">
        {icon}
      </span>
      <div className="decimation-notice-body">
        <p className="decimation-notice-title">{title}</p>
        <p className="decimation-notice-detail">{detail}</p>
      </div>
      <span
        className="material-symbols-rounded decimation-notice-info"
        aria-hidden="true"
      >
        info
      </span>
      {anchor && (
        <DecimationDetails
          frameCounts={frameCounts}
          isUserChosen={isUserChosen}
          anchor={anchor}
        />
      )}
    </div>
  );
}

/**
 * Explains how Decimate works: with this exam's numbers when slices were
 * skipped, otherwise in general. Portalled to the body and fixed beside the
 * callout, because the side panel clips its overflow.
 */
function DecimationDetails({ frameCounts, isUserChosen, anchor }) {
  const style = { top: anchor.top, left: anchor.right + DETAILS_GAP_PX };

  return createPortal(
    <div className="decimation-details" style={style}>
      <p className="decimation-details-title">
        {messages.decimation.details.title}
      </p>
      {wasDecimated(frameCounts) ? (
        <ExamDetails frameCounts={frameCounts} isUserChosen={isUserChosen} />
      ) : (
        <GeneralDetails />
      )}
    </div>,
    document.body,
  );
}

// Walks through the arithmetic that produced this exam's shown count
function ExamDetails({ frameCounts, isUserChosen }) {
  const { shown, total, step, max } = frameCounts;
  const { details } = messages.decimation;

  return (
    <>
      <p>
        {isUserChosen
          ? details.chosen(total, max)
          : details.overLimit(total, max)}
      </p>
      <p>{details.evenSpacing(step, max, shown)}</p>
      {isUserChosen && (
        <SameResultDetails total={total} step={step} shown={shown} />
      )}
      <p>{details.hidden(total - shown)}</p>
      {isUserChosen && <p>{details.turnOff}</p>}
    </>
  );
}

// Which Decimate values give this same count, and the nearest ones that don't
function SameResultDetails({ total, step, shown }) {
  const { details } = messages.decimation;
  const same = decimateRangeForStep(total, step);
  const choices = [
    describeChoice(total, step - 1),
    describeChoice(total, step + 1),
  ].filter(Boolean);

  return (
    <>
      {same && <p>{details.sameResult(same.from, same.to, shown)}</p>}
      {choices.length > 0 && <p>{details.otherChoices(choices)}</p>}
    </>
  );
}

// The Decimate values for a neighbouring step, or null if no value gives it
function describeChoice(total, step) {
  const range = step >= 1 ? decimateRangeForStep(total, step) : null;
  if (!range) {
    return null;
  }

  const { details } = messages.decimation;
  if (step === 1) {
    return details.choiceAll(range.from, total);
  }
  return details.choiceRange(
    range.from,
    range.to,
    framesKeptAtStep(total, step),
  );
}

function GeneralDetails() {
  const { general } = messages.decimation.details;

  return (
    <>
      <p>{general.intro}</p>
      <p>{general.evenSpacing}</p>
      <p>{general.example}</p>
      <p>{general.hidden}</p>
    </>
  );
}

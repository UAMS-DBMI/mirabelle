/**
 * Corner button that expands a viewport to fill the grid (or restores it).
 * Rendered as a React child of the Cornerstone host element, like
 * ViewportLabel — the same toggle the double-click gesture performs, made
 * discoverable. Not used on the stack viewport, which fills its route alone.
 */
import React from "react";

import "./ViewportExpandButton.css";

function ViewportExpandButton({ expanded, onToggle }) {
  return (
    <button
      type="button"
      className="viewport-expand-button"
      title={expanded ? "Restore viewport" : "Expand viewport"}
      aria-label={expanded ? "Restore viewport" : "Expand viewport"}
      // Keep the click from reaching the viewport's tools / active-pane
      // selection; expanding is the only intent here.
      onMouseDownCapture={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span className="material-symbols-rounded">
        {expanded ? "close_fullscreen" : "open_in_full"}
      </span>
    </button>
  );
}

export default ViewportExpandButton;

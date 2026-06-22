import React from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleLeftPanel,
  toggleRightPanel,
} from "@/features/presentationSlice";
import "./ViewerResizer.css";

export default function ViewerResizer() {
  const dispatch = useDispatch();

  const leftPanelVisibility = useSelector(
    (s) => s.presentation.panelConfig.visibility.left,
  );
  const rightPanelVisibility = useSelector(
    (s) => s.presentation.panelConfig.visibility.right,
  );
  const showLeft = useSelector((s) => s.presentation.panelConfig.open.left);
  const showRight = useSelector((s) => s.presentation.panelConfig.open.right);

  if (!leftPanelVisibility && !rightPanelVisibility) {
    return null;
  }

  return (
    <div id="viewer-resizer">
      {leftPanelVisibility && (
        <button
          className={`material-symbols-rounded left-btn ${!showLeft ? "flipped" : ""}`}
          onClick={() => dispatch(toggleLeftPanel())}
        >
          chevron_left
        </button>
      )}
      {rightPanelVisibility && (
        <button
          className={`material-symbols-rounded right-btn ${!showRight ? "flipped" : ""}`}
          onClick={() => dispatch(toggleRightPanel())}
        >
          chevron_right
        </button>
      )}
    </div>
  );
}

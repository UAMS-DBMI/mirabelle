/**
 * Small corner badge naming the view a viewport shows (Axial / Coronal /
 * Sagittal / 3D / Stack). Rendered as a React child of the Cornerstone host
 * element — Cornerstone only appends its own `div.viewport-element` there and
 * never touches other children, so a React-owned overlay is safe.
 */
import React from "react";

import "./ViewportLabel.css";

function ViewportLabel({ text }) {
  if (!text) {
    return null;
  }
  return <div className="viewport-label">{text}</div>;
}

export default ViewportLabel;

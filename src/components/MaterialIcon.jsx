/**
 * A simple component to display a Material Icon
 */
import React from "react";

import "./MaterialIcon.css";

function MaterialIcon({ icon }) {
  return (
    <span className="material-symbols-rounded" readOnly>
      {icon}
    </span>
  );
}

export default MaterialIcon;

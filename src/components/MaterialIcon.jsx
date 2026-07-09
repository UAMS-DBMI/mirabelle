/**
 * A simple component to display a Material Icon
 */
import React from "react";

import "./MaterialIcon.css";

function MaterialIcon({ icon, className, title }) {
  return (
    <span
      className={`material-symbols-rounded${className ? ` ${className}` : ""}`}
      title={title}
      readOnly
    >
      {icon}
    </span>
  );
}

export default MaterialIcon;

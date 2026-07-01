/**
 * A simple Button Set component for use in the toolbar or elsewhere
 *
 * Keeps track of which button is active, and calls a callback on click
 *
 * buttonConfig should look like:
    const leftClickGroupButtonConfig = [
		{
			name: "Window Level",
			icon: "exposure",
			action: () => switchLeftClickMode("winlev"),
		},
		{
			name: "Crosshairs",
			icon: "point_scan",
			action: () => switchLeftClickMode("crosshair"),
		},
		{
			name: "Selection",
			icon: "gesture_select",
			action: () => switchLeftClickMode("selection"),
		},

    ];
 */
import React from "react";
import { useState } from "react";
import MaterialIcon from "./MaterialIcon";

import "./MaterialButtonSet.css";

function MaterialButtonSet({
  buttonConfig,
  initialActiveButton,
  noRemember = false,
}) {
  const [activeButton, setActiveButton] = useState(initialActiveButton);

  function buttonClick(item) {
    if (item.disabled) {
      return; // ignore clicks on disabled buttons
    }
    item.action(); // call the supplied callback
    if (!noRemember) {
      setActiveButton(item.name);
    }
  }

  function getActiveClass(buttonName) {
    if (buttonName === activeButton) {
      return "active";
    } else {
      return "inactive";
    }
  }

  return (
    <ul>
      {buttonConfig.map((item, index) => (
        <li key={index}>
          <button
            title={item.name}
            onClick={() => buttonClick(item)}
            className={`${getActiveClass(item.name)}${item.disabled ? " disabled" : ""}`}
            disabled={item.disabled}
          >
            <MaterialIcon icon={item.icon} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default MaterialButtonSet;

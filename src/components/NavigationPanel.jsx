import React from "react";
import MaterialButtonSet from "@/components/MaterialButtonSet";

import "./NavigationPanel.css";

function NavigationPanel({
  onNext = () => { },
  onPrevious = () => { },
  currentId,
  idLabel = "IEC",
}) {
  const navButtons = [
    { name: "Previous", icon: "arrow_back", action: onPrevious },
    { name: "Next", icon: "arrow_forward", action: onNext },
  ];

  return (
    <div id="navigation-panel" className="side-panel">
      {/* {currentId && <p>{idLabel}: {currentId}</p>} */}
      <h2 id="title">Navigation</h2>
      <MaterialButtonSet buttonConfig={navButtons} noRemember={true} />
    </div>
  );
}

export default NavigationPanel;
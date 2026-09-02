import React from "react";
import MaterialButtonSet from "@/components/MaterialButtonSet";

import "./NavigationPanel.css";

function NavigationPanel({
  onNext = () => {},
  onPrevious = () => {},
  hasNext = true,
  hasPrevious = true,
  currentId,
  idLabel = "IEC",
}) {
  const navButtons = [
    {
      name: "Previous",
      icon: "arrow_back",
      action: onPrevious,
      dimmed: !hasPrevious,
    },
    { name: "Next", icon: "arrow_forward", action: onNext, dimmed: !hasNext },
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

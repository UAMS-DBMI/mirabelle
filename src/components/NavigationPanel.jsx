import React from "react";
import MaterialButtonSet from "@/components/MaterialButtonSet";
import CollapsiblePanel from "@/components/CollapsiblePanel";

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
    <CollapsiblePanel
      id="navigation-panel"
      panelKey="navigation"
      title="Navigation"
    >
      {/* {currentId && <p>{idLabel}: {currentId}</p>} */}
      <MaterialButtonSet buttonConfig={navButtons} noRemember={true} />
    </CollapsiblePanel>
  );
}

export default NavigationPanel;

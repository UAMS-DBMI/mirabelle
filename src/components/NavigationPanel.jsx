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
  children,
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

  // The exam queue (IecQueue) renders inside this panel rather than as a
  // sibling card; with it present the panel grows to give the queue room.
  const hasQueue = React.Children.toArray(children).length > 0;

  return (
    <CollapsiblePanel
      id="navigation-panel"
      panelKey="navigation"
      title="Navigation"
      className={hasQueue ? "with-queue" : undefined}
    >
      {/* {currentId && <p>{idLabel}: {currentId}</p>} */}
      <MaterialButtonSet buttonConfig={navButtons} noRemember={true} />
      {children}
    </CollapsiblePanel>
  );
}

export default NavigationPanel;

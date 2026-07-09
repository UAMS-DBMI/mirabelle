import React from "react";
import { useSelector } from "react-redux";
import MaterialButtonSet from "@/components/MaterialButtonSet";

import "./NavigationPanel.css";

function NavigationPanel({
  onNext = () => {},
  onPrevious = () => {},
  currentId,
  idLabel = "IEC",
  children,
}) {
  // Navigation is blocked while an exam is loading (see the VR wrappers); grey
  // the buttons out so it's clear why they don't respond mid-load.
  const loading = useSelector((state) => state.options.loading);
  const navButtons = [
    {
      name: "Previous",
      icon: "arrow_back",
      action: onPrevious,
      disabled: loading,
    },
    { name: "Next", icon: "arrow_forward", action: onNext, disabled: loading },
  ];

  // The exam queue (IecQueue) renders inside this panel rather than as a
  // sibling card; with it present the panel grows to give the queue room.
  const hasQueue = React.Children.toArray(children).length > 0;

  return (
    <div
      id="navigation-panel"
      className={`side-panel${hasQueue ? " with-queue" : ""}`}
    >
      {/* {currentId && <p>{idLabel}: {currentId}</p>} */}
      <h2 id="title">Navigation</h2>
      <MaterialButtonSet buttonConfig={navButtons} noRemember={true} />
      {children}
    </div>
  );
}

export default NavigationPanel;

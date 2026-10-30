/**
 * A side-panel card that folds away: its title is a button that hides
 * everything else in the card, leaving just the title bar, and brings it back
 * on a second click. Each card remembers whether it's folded in this browser,
 * so a curator who folds Tools keeps it folded from exam to exam and across
 * reloads.
 *
 * The card's children stay as they are, direct children of the
 * `.side-panel`, so every panel keeps its own layout; folding only hides them.
 */
import React, { useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";

import "./CollapsiblePanel.css";

const STORAGE_KEY = "mirabelle.foldedPanels";

function readFoldedPanels() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch (error) {
    console.warn("[CollapsiblePanel] couldn't read the folded panels", error);
    return {};
  }
}

function rememberFolded(panelKey, folded) {
  try {
    const panels = readFoldedPanels();
    panels[panelKey] = folded;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  } catch (error) {
    console.warn("[CollapsiblePanel] couldn't remember a folded panel", error);
  }
}

/**
 * @param {object} props
 * @param {string} props.panelKey which card this is, for remembering it
 * @param {string} props.title
 * @param {string} [props.id] the card's DOM id (panels style themselves by it)
 * @param {string} [props.className] extra classes for the card
 * @param {React.ReactNode} [props.headerExtra] shown at the right of the title
 */
export default function CollapsiblePanel({
  panelKey,
  title,
  id,
  className,
  headerExtra,
  children,
}) {
  const [folded, setFolded] = useState(
    () => readFoldedPanels()[panelKey] === true,
  );

  const toggle = () => {
    const next = !folded;
    setFolded(next);
    rememberFolded(panelKey, next);
  };

  return (
    <div
      id={id}
      className={`side-panel${folded ? " collapsed" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <h2 id="title" className="collapsible-panel__header">
        <button
          type="button"
          className="collapsible-panel__toggle"
          onClick={toggle}
          aria-expanded={!folded}
          title={folded ? `Show ${title}` : `Hide ${title}`}
        >
          {title}
          {headerExtra && (
            <span className="collapsible-panel__extra">{headerExtra}</span>
          )}
          <MaterialIcon
            icon="expand_more"
            className="collapsible-panel__chevron"
          />
        </button>
      </h2>
      {children}
    </div>
  );
}

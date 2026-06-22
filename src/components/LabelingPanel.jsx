import React from "react";

import "./LabelingPanel.css";

export default function LabelingPanel({ config, onLabel }) {
  return (
    <div id="LabelingPanel">
      <ul>
        {config.map((item, index) => (
          <li key={index}>
            <button title={item.name} onClick={() => onLabel(item.action)}>
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

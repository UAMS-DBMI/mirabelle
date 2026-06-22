import React from "react";

import "./ErrorPanel.css";

export default function ErrorPanel({ error, onRetry }) {
  return (
    <div id="error-panel">
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <p>
        <i>{error}</i>
      </p>
      {onRetry && <button onClick={onRetry}>Try Again</button>}
    </div>
  );
}

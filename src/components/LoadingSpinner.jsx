import React from 'react';

import './LoadingSpinner.css';

export default function LoadingSpinner() {
  return (
    <div id="loading-spinner">
      <div id="spinner"></div>
      <p id="description">Loading...</p>
    </div>
  );
}

import React from 'react';
import * as cornerstoneTools from '@cornerstonejs/tools';
const { segmentation } = cornerstoneTools;

import './SegPanel.css';

export default function SegPanel({ segments, segmentationId }) {
  const handleToggle = (segmentIndex) => {
    const visible = segmentation.state.getSegmentVisibility(segmentationId, segmentIndex);
    segmentation.setSegmentVisibility(segmentationId, segmentIndex, !visible);
  };

  return (
    <div id="seg-panel" className="side-panel">
      {!segments || segments.length === 0 ? (
        <p>No segment data available.</p>
      ) : (
        <>
          <h3>Segments</h3>
          <ul>
            {segments.map(({ segmentIndex, label }) => (
              <li key={segmentIndex}>
                <label>
                  <input
                    type="checkbox"
                    defaultChecked
                    onChange={() => handleToggle(segmentIndex)}
                  />
                  {label || `Segment ${segmentIndex}`}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
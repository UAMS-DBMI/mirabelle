import React, { useState, useLayoutEffect } from "react";
import * as cornerstoneTools from "@cornerstonejs/tools";
const { segmentation } = cornerstoneTools;
import { useSelector } from "react-redux";

import "./SegPanel.css";

export default function SegPanel({ segments }) {
  // This is here to force a re-render of this component whenever
  // a new viewport mounts. Over in VolumeViewport the viewport
  // option is updated whenever a new viewport is mounted.
  const lastMountedViewport = useSelector(state => state.options.viewport)
  const [colors, setColors] = useState();

  const viewportIds = cornerstone
    .getRenderingEngines()?.[0]
    .getViewports()
    .filter((viewport) => viewport.type === "orthographic")
    .map((viewport) => viewport.id);

  useLayoutEffect(() => {
    // Get the color for each segment

    if (!viewportIds || viewportIds.length === 0) {
      return;
    }

    const segmentationIds = segmentation.state
      .getSegmentations()
      .map((seg) => seg.segmentationId);

    const segmentIndices = segments.map((seg) => seg.segmentIndex);

    const firstViewportId = viewportIds[0];

    let lcolors = {};

    for (const segmentIndex of segmentIndices) {
      for (const segId of segmentationIds) {
        const color = cornerstoneTools.segmentation.config.color.getSegmentIndexColor(
          firstViewportId,
          segId,
          segmentIndex,
        );
        // Yes this will repeat for several indexes but they should
        // share the same color anyway
        lcolors[segmentIndex] = color;
      }
    }
    setColors(lcolors);
  }, [segments, lastMountedViewport]);

  const handleToggle = (segmentIndex, event) => {

    let visible = event.target.checked;

    // For each viewport:
    //   For each segmentation:
    //     Call the function to set visibility

    const segmentationIds = segmentation.state
      .getSegmentations()
      .map((seg) => seg.segmentationId);

    for (const viewportId of viewportIds) {
      for (const segId of segmentationIds) {
        try {
          segmentation.config.visibility.setSegmentIndexVisibility(
            viewportId,
            { segmentationId: segId },
            segmentIndex,
            visible,
          );
        } catch (error) {
          // just keep on keeping on
          console.warn(error);
        }
      }
    }
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
                    onChange={(event) => handleToggle(segmentIndex, event)}
                  />
                  {label || `Segment ${segmentIndex}`}
                  {colors && colors[segmentIndex] && (
                    <span
                      className="seg-color"
                      style={{
                        backgroundColor: `rgba(${colors[segmentIndex].join(",")})`,
                      }}
                    >The color</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

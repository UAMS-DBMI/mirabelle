import React, { useState, useLayoutEffect } from "react";
import * as cornerstoneTools from "@cornerstonejs/tools";
const { segmentation } = cornerstoneTools;
import { useSelector } from "react-redux";

import "./SegPanel.css";

export default function SegPanel({ segments }) {
  // This is here to force a re-render of this component whenever
  // a new viewport mounts. Over in VolumeViewport the viewport
  // option is updated whenever a new viewport is mounted.
  const _ = useSelector(state => state.options.viewport)

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
  }, [segments, viewportIds.length]);

  const handleToggle = (segmentIndex, event) => {


    const visible = event.currentTarget.classList.toggle("selected");

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

  // NOTE We may have set some segments to skip when loading from
  // the DICOM SEG object, so we want to skip them here.
  const displaySegments = segments.filter((s) => s.skip !== true);

  if (!colors) {
    // Don't render at all until we have the colors
    return;
  }

  return (
    <div id="seg-panel" className="side-panel">
      <h2 id="title">Segments</h2>
      {!displaySegments || displaySegments.length === 0 ? (
        <p>No segment data available.</p>
      ) : (
        <>
          <ul className="wrapper">
            {displaySegments.map(({ segmentIndex, label }) => (
              <li key={segmentIndex}
                className="selected"
                onClick={
                  (event) => handleToggle(segmentIndex, event)
                }>
                {colors && colors[segmentIndex] && (
                  <div
                    className="seg-color"
                    style={{
                      backgroundColor: `rgba(${colors[segmentIndex].join(",")})`,
                    }}
                  ></div>
                )}
                <label>{label || `Segment ${segmentIndex}`}</label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

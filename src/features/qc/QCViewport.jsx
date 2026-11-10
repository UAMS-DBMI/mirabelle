import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";

import * as cornerstone from "@cornerstonejs/core";
import { RenderingEngine } from "@cornerstonejs/core";

import useRendererResize from "@/hooks/useRendererResize";
import { setOption } from "@/features/optionSlice";
import StackViewport from "@/components/StackViewport";
import { messages } from "@/lib/messages";

import { RENDERING_ENGINE_ID, VIEWPORT_ID } from "./viewport";

import { hasValue } from "./dicomText";

import "./QCViewport.css";

// The usual viewer corners: patient top-left, study top-right, display
// bottom-left, position bottom-right. A line or part with no value is left
// out.

// The values that are present, joined with " · ".
function join(...values) {
  return values.filter(hasValue).join(" · ");
}

function patientLines(info) {
  if (!info) return [];
  return [
    info.patientName,
    hasValue(info.patientId) ? `ID ${info.patientId}` : "",
    join(
      hasValue(info.patientBirthDate) ? `DOB ${info.patientBirthDate}` : "",
      [info.patientAge, info.patientSex].filter(hasValue).join(" "),
    ),
  ];
}

function studyLines(info) {
  if (!info) return [];
  // The series line leads: it is often the longest, and wrapping at the top
  // pushes the shorter lines down rather than running toward the image.
  return [
    join(
      info.modality,
      hasValue(info.seriesNumber) ? `Se ${info.seriesNumber}` : "",
      info.seriesDescription,
    ),
    info.studyDescription,
    join(info.studyDate, info.studyTime),
    info.institution,
  ];
}

function OverlayLines({ className, lines }) {
  return (
    <div className={className}>
      {lines.filter(hasValue).map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

/**
 * The QC viewer area: the shared Cornerstone stack viewport inside a black
 * rounded container, with DICOM corner overlays (study text, window/level,
 * frame position) that follow the displayed frame.
 */
export default function QCViewport({
  frames,
  toolGroup,
  studyInfo,
  viewportInfo,
  frameIndex,
  frameCount,
  noPixelData,
  showLabels = true,
}) {
  const dispatch = useDispatch();
  const [renderingEngine, setRenderingEngine] = useState();

  useRendererResize(renderingEngine);

  useEffect(() => {
    let engine = cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
    if (engine === undefined) {
      engine = new RenderingEngine(RENDERING_ENGINE_ID);
    }
    setRenderingEngine(engine);
  }, []);

  function handleImageChange(imageId) {
    dispatch(setOption({ key: "currentImageId", value: imageId }));
  }

  if (renderingEngine == null) {
    return <div id="qc-viewport" />;
  }

  const { zoom, windowCenter, windowWidth } = viewportInfo || {};
  const frameLabel =
    frameIndex >= 0 && frameCount ? `${frameIndex + 1} / ${frameCount}` : "—";

  return (
    <div id="qc-viewport">
      <StackViewport
        onImageChange={handleImageChange}
        frames={frames}
        toolGroup={toolGroup}
        renderingEngine={renderingEngine}
        viewportId={VIEWPORT_ID}
        label={null}
      />

      {/* Covers the last image drawn, which the viewport still holds. */}
      {noPixelData && (
        <div className="qc-no-pixel-data">{messages.viewport.noPixelData}</div>
      )}

      <div className="qc-viewport-overlay" hidden={!showLabels}>
        <OverlayLines
          className="qc-overlay-top-left"
          lines={patientLines(studyInfo)}
        />
        <OverlayLines
          className="qc-overlay-top-right"
          lines={studyLines(studyInfo)}
        />
        {!noPixelData && (
          <div className="qc-overlay-bottom-left">
            WL {windowCenter ?? "—"}&nbsp;&nbsp;WW {windowWidth ?? "—"}
            <br />
            Zoom {zoom != null ? `${Math.round(zoom * 100)}%` : "—"}
          </div>
        )}
        <div className="qc-overlay-bottom-right">
          Instance {studyInfo?.instanceNumber || "—"}
          <br />
          Frame {frameLabel}
        </div>
      </div>
    </div>
  );
}

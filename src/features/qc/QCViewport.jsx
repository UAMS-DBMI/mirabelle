import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";

import * as cornerstone from "@cornerstonejs/core";
import { RenderingEngine } from "@cornerstonejs/core";

import useRendererResize from "@/hooks/useRendererResize";
import { setOption } from "@/features/optionSlice";
import StackViewport from "@/components/StackViewport";

import { RENDERING_ENGINE_ID, VIEWPORT_ID } from "./viewport";

import "./QCViewport.css";

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
      />

      <div className="qc-viewport-overlay">
        <div className="qc-overlay-top-right">
          {studyInfo?.modality || "—"} · {studyInfo?.studyDate || "—"}
          <br />
          {studyInfo?.seriesDescription || "—"}
        </div>
        <div className="qc-overlay-bottom-left">
          WL {windowCenter ?? "—"}&nbsp;&nbsp;WW {windowWidth ?? "—"}
          <br />
          Zoom {zoom != null ? `${Math.round(zoom * 100)}%` : "—"}
        </div>
        <div className="qc-overlay-bottom-right">
          Instance {studyInfo?.instanceNumber || "—"}
          <br />
          Frame {frameLabel}
        </div>
      </div>
    </div>
  );
}

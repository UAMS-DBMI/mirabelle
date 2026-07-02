import React, { useState, useEffect, useRef } from "react";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import MaterialIcon from "@/components/MaterialIcon";

import "./CineControls.css";

const { cine } = cornerstoneTools.utilities;

const RENDERING_ENGINE_ID = "re1";
const VIEWPORT_ID = "myviewport";

const MIN_FPS = 1;
const MAX_FPS = 60;

/**
 * Cine playback controls for the QC stack viewport: play/pause, frame
 * stepping, and playback speed. Drives the shared "myviewport" stack
 * viewport via Cornerstone Tools' cine utility, so STACK_NEW_IMAGE still
 * fires and the DICOM dump keeps following the current frame.
 *
 * Mount with a key per series so playback stops when the series changes.
 */
export default function CineControls() {
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(15);
  // The element cine is playing on, so unmount can stop it even after the
  // viewport itself has been torn down.
  const playingElementRef = useRef(null);

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  function getViewport() {
    const renderingEngine = cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
    return renderingEngine?.getViewport(VIEWPORT_ID);
  }

  function stopPlayback() {
    if (playingElementRef.current) {
      try {
        cine.stopClip(playingElementRef.current);
      } catch (error) {
        // The viewport may already be disabled during teardown.
        console.warn("Failed to stop cine playback:", error);
      }
      playingElementRef.current = null;
    }
    setPlaying(false);
  }

  function startPlayback(framesPerSecond) {
    const viewport = getViewport();
    if (!viewport) return;
    cine.playClip(viewport.element, { framesPerSecond });
    playingElementRef.current = viewport.element;
    setPlaying(true);
  }

  function handlePlayPause() {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback(fps);
    }
  }

  function stepFrame(delta) {
    stopPlayback();
    const viewport = getViewport();
    if (!viewport) return;
    const lastIndex = viewport.getImageIds().length - 1;
    const next = viewport.getCurrentImageIdIndex() + delta;
    viewport.setImageIdIndex(Math.min(Math.max(next, 0), lastIndex));
  }

  function handleFpsChange(e) {
    const parsed = parseInt(e.target.value, 10);
    const value = Math.min(Math.max(parsed || MIN_FPS, MIN_FPS), MAX_FPS);
    setFps(value);
    if (playing) {
      // playClip restarts the loop with the new speed.
      startPlayback(value);
    }
  }

  return (
    <div id="cine-controls">
      <button title="Previous frame" onClick={() => stepFrame(-1)}>
        <MaterialIcon icon="chevron_left" />
      </button>
      <button title={playing ? "Pause" : "Play"} onClick={handlePlayPause}>
        <MaterialIcon icon={playing ? "pause" : "play_arrow"} />
      </button>
      <button title="Next frame" onClick={() => stepFrame(1)}>
        <MaterialIcon icon="chevron_right" />
      </button>
      <label>
        <span>fps:</span>
        <input
          id="cine-fps"
          type="number"
          min={MIN_FPS}
          max={MAX_FPS}
          value={fps}
          onChange={handleFpsChange}
        />
      </label>
    </div>
  );
}

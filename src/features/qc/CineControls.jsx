import React, { useState, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import * as cornerstoneTools from "@cornerstonejs/tools";

import MaterialIcon from "@/components/MaterialIcon";

import { getQCViewport } from "./viewport";

import "./CineControls.css";

const { cine } = cornerstoneTools.utilities;

const FPS_OPTIONS = [5, 10, 15, 24, 30];

/**
 * Cine bar for the QC stack viewport: frame stepping, play/pause, a scrub
 * slider and playback speed. Drives the shared "myviewport" stack viewport
 * via Cornerstone Tools' cine utility, so STACK_NEW_IMAGE still fires and
 * the overlays/dump keep following the current frame.
 *
 * Mount with a key per series so playback stops when the series changes.
 */
export default function CineControls({ frameIndex, frameCount }) {
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(15);
  // The element cine is playing on, so unmount can stop it even after the
  // viewport itself has been torn down.
  const playingElementRef = useRef(null);

  useEffect(() => {
    return () => stopPlayback();
  }, []);

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
    const viewport = getQCViewport();
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

  function goToFrame(index) {
    stopPlayback();
    const viewport = getQCViewport();
    if (!viewport) return;
    const lastIndex = viewport.getImageIds().length - 1;
    viewport.setImageIdIndex(Math.min(Math.max(index, 0), lastIndex));
  }

  function stepFrame(delta) {
    const viewport = getQCViewport();
    if (!viewport) return;
    goToFrame(viewport.getCurrentImageIdIndex() + delta);
  }

  function handleFpsChange(e) {
    const value = parseInt(e.target.value, 10);
    setFps(value);
    if (playing) {
      // playClip restarts the loop with the new speed.
      startPlayback(value);
    }
  }

  useHotkeys("space", handlePlayPause, { preventDefault: true });
  useHotkeys("left", () => stepFrame(-1), { preventDefault: true });
  useHotkeys("right", () => stepFrame(1), { preventDefault: true });

  const frameLabel =
    frameIndex >= 0 && frameCount ? `${frameIndex + 1} / ${frameCount}` : "—";

  return (
    <div id="qc-cine-bar">
      <button
        className="qc-btn qc-cine-step"
        title="Previous frame"
        onClick={() => stepFrame(-1)}
      >
        <MaterialIcon icon="chevron_left" />
      </button>
      <button
        id="qc-cine-play"
        title={playing ? "Pause" : "Play"}
        onClick={handlePlayPause}
      >
        <MaterialIcon icon={playing ? "pause" : "play_arrow"} />
      </button>
      <button
        className="qc-btn qc-cine-step"
        title="Next frame"
        onClick={() => stepFrame(1)}
      >
        <MaterialIcon icon="chevron_right" />
      </button>

      <input
        id="qc-cine-scrub"
        type="range"
        min={0}
        max={Math.max(frameCount - 1, 0)}
        value={Math.max(frameIndex, 0)}
        onChange={(e) => goToFrame(parseInt(e.target.value, 10))}
      />

      <div className="qc-cine-frame-label">{frameLabel}</div>

      <div className="qc-cine-divider" />

      <select id="qc-cine-fps" value={fps} onChange={handleFpsChange}>
        {FPS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option} fps
          </option>
        ))}
      </select>
    </div>
  );
}

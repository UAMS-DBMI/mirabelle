/**
 * The stack's slice browser: a column beside the image with a cine player
 * (Play/Pause and a speed) on top and a thumbnail of every slice below it.
 * Clicking a thumbnail shows that slice. The slice on screen is highlighted
 * and kept in view, so the column follows the wheel, the keys and cine alike.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Enums } from "@cornerstonejs/core";
import { utilities as toolsUtilities } from "@cornerstonejs/tools";

import MaterialIcon from "@/components/MaterialIcon";
import { renderImageToCanvas } from "@/lib/renderImageToCanvas";

import "./SliceBrowser.css";

const { cine } = toolsUtilities;

// Cine speeds offered, in frames per second. Slow by default: the point is to
// look at each slice.
const CINE_SPEEDS = [2, 5, 10, 15, 20];
const DEFAULT_CINE_SPEED = 5;

// Thumbnails are drawn once they come within this distance of the column's
// visible part, so a long stack only draws what the curator scrolls to.
const DRAW_AHEAD_MARGIN = "300px 0px";

// Range of thumbnail height/width ratios, so an unusually tall or wide image
// still gets a usable thumbnail.
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 1.6;

export default function SliceBrowser({ viewport, frames }) {
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [framesPerSecond, setFramesPerSecond] = useState(DEFAULT_CINE_SPEED);

  // Follow the slice on screen, whatever changed it.
  useEffect(() => {
    if (!viewport) return;
    setActiveIndex(viewport.getCurrentImageIdIndex());
    const onNewImage = (event) => setActiveIndex(event.detail.imageIdIndex);
    const { STACK_NEW_IMAGE } = Enums.Events;
    viewport.element.addEventListener(STACK_NEW_IMAGE, onNewImage);
    return () =>
      viewport.element.removeEventListener(STACK_NEW_IMAGE, onNewImage);
  }, [viewport]);

  useEffect(() => {
    const list = listRef.current;
    keepInView(list, list?.children[activeIndex]);
  }, [activeIndex]);

  // Play while isPlaying, restarting at a new speed. Stopped on pause and on
  // unmount; the viewport id finds the clip even if the viewport was disabled
  // first.
  useEffect(() => {
    if (!viewport || !isPlaying) return;
    cine.playClip(viewport.element, { framesPerSecond, loop: true });
    return () => cine.stopClip(viewport.element, { viewportId: viewport.id });
  }, [viewport, isPlaying, framesPerSecond]);

  // Same path as the wheel and the scrollbar.
  const showSlice = useCallback(
    (index) => viewport?.scroll(index - viewport.getTargetImageIdIndex()),
    [viewport],
  );

  const handleSpeedChange = (event) => {
    setFramesPerSecond(Number(event.target.value));
    // A focused select takes the arrow keys, which then change the speed
    // instead of stepping through the slices.
    event.target.blur();
  };

  return (
    <div className="slice-browser">
      <div className="slice-browser-cine">
        <button
          type="button"
          className={`slice-browser-play ${isPlaying ? "is-active" : ""}`}
          disabled={!viewport}
          onClick={() => setIsPlaying((playing) => !playing)}
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-pressed={isPlaying}
        >
          <MaterialIcon icon={isPlaying ? "pause" : "play_arrow"} />
        </button>
        <select
          className="slice-browser-speed"
          value={framesPerSecond}
          onChange={handleSpeedChange}
          title="Cine speed"
          aria-label="Cine speed"
        >
          {CINE_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed} fps
            </option>
          ))}
        </select>
      </div>
      <div
        ref={listRef}
        className="slice-browser-list"
        style={{ "--thumbnail-aspect": thumbnailAspect(viewport) }}
      >
        {/* Listed once the first slice is up: its size sets the thumbnails'
            shape, and they're drawn at the size they're laid out at. */}
        {viewport &&
          frames.map((imageId, index) => (
            <SliceThumbnail
              key={imageId}
              imageId={imageId}
              index={index}
              active={index === activeIndex}
              listRef={listRef}
              onSelect={showSlice}
            />
          ))}
      </div>
    </div>
  );
}

// One slice's thumbnail, drawn once it nears the visible part of the list.
const SliceThumbnail = memo(function SliceThumbnail({
  imageId,
  index,
  active,
  listRef,
  onSelect,
}) {
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        drawThumbnail(canvasRef.current, imageId);
      },
      { root: listRef.current, rootMargin: DRAW_AHEAD_MARGIN },
    );
    observer.observe(buttonRef.current);
    return () => observer.disconnect();
  }, [imageId, listRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`slice-thumbnail ${active ? "is-active" : ""}`}
      onClick={() => onSelect(index)}
      title={`Slice ${index + 1}`}
      aria-label={`Slice ${index + 1}`}
      aria-current={active}
    >
      <canvas ref={canvasRef} />
      <span className="slice-thumbnail-number">{index + 1}</span>
    </button>
  );
});

// Draw `imageId` into `canvas` at the canvas's laid-out size, with the
// image's own window/level. It goes through the image cache, so a frame the
// stack already loaded (or is loading) isn't fetched again.
function drawThumbnail(canvas, imageId) {
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  renderImageToCanvas(canvas, imageId).catch((error) => {
    console.warn("[SliceBrowser] couldn't draw thumbnail", imageId, error);
  });
}

// Height/width of the thumbnails, from the slice on screen (a stack's slices
// share a size).
function thumbnailAspect(viewport) {
  const image = viewport?.getCornerstoneImage();
  if (!image?.rows || !image?.columns) return 1;
  const aspect = image.rows / image.columns;
  return Math.min(Math.max(aspect, MIN_ASPECT), MAX_ASPECT);
}

// Scroll `list` just enough to show `item`. scrollIntoView would also scroll
// the overflow-hidden layout around the viewer.
function keepInView(list, item) {
  if (!list || !item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

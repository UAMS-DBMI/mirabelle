# Stack Slice Browser — Implementation Notes

Curators can now step through a stack from the keyboard, see which slice
they're on at a glance, play the stack as a cine loop, and jump to any slice
from a column of thumbnails they can resize.

**Branch:** `multi-slice-stack-explorer-develop-main`

**Audience:** developers touching the stack viewer. The slice scrollbar it
builds on is described in [stack-slice-scrollbar.md](stack-slice-scrollbar.md).

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/StackViewport.jsx](../src/components/StackViewport.jsx) | Slice keys; attaches the slice counter; hands its viewport to `StackView` |
| [src/lib/sliceScrollbar.js](../src/lib/sliceScrollbar.js) | `attachSliceCounter`, the "N / total" corner counter |
| [src/hooks/useRendererResize.js](../src/hooks/useRendererResize.js) | Keeps a stack fitted to its pane when the pane changes size |
| [src/lib/renderImageToCanvas.js](../src/lib/renderImageToCanvas.js) | Draws a thumbnail, safe for unscaled PT images |
| [src/features/stack-view/SliceBrowser.jsx](../src/features/stack-view/SliceBrowser.jsx) | Cine controls, the thumbnail column and its drag handle |
| [src/features/stack-view/StackView.jsx](../src/features/stack-view/StackView.jsx) | Lays the image pane and the slice browser side by side |

---

## 1. The problem

A stack (a DBT series of 57 slices, say) could be scrolled with the wheel or the
slice scrollbar, but only that way:

- no keys stepped through the slices;
- the slice number only showed while hovering the scrollbar;
- there was no way to play the stack, or to see the slices side by side and jump
  to one.

## 2. What was added

All of it is in the shared stack viewer, so the DICOM review, Mask and Mask
Review routes all get it. Stacks with a single slice get none of it.

### 2.1 Slice keys

| Key | Action |
|---|---|
| Up / Down | Previous / next slice |
| PageUp / PageDown | 10 slices back / forward |
| Home / End | First / last slice |

They call `viewport.scroll`, the same as the wheel. It clamps at the ends, so
Home and End are a step the length of the stack. Left/Right are unchanged (IEC
navigation). The keys are ignored while a form field has focus
(`react-hotkeys-hook`'s default), and their default is prevented so they don't
also scroll a side panel.

`useHotkeys` memoizes its callbacks on the first render when no dependencies
are given, so the callbacks read the viewport through a ref.

### 2.2 Slice counter

`attachSliceCounter` puts "12 / 57" in the pane's top-right corner, clear of the
scrollbar. Like the scrollbar, it's a DOM node updated on every
`IMAGE_RENDERED` (sharing its `readSlicePosition`), so it follows the wheel, the
keys, scrubbing and cine alike.

### 2.3 Cine

Play/Pause and a speed (2–20 fps, 5 by default) at the top of the column. It
uses Cornerstone's `utilities.cine.playClip` / `stopClip`, looping. An effect
plays while `isPlaying` is set and stops in its cleanup, so pausing, changing
speed (stop, then play at the new speed) and leaving the exam all stop the
running clip. `stopClip` is given the viewport id so it finds the clip even if
the viewport was disabled first.

The speed select blurs itself after a change: a focused select takes the arrow
keys, so they would change the speed instead of the slice.

### 2.4 Thumbnails

A column of thumbnails beside the image, one per slice, numbered. Clicking one
shows that slice (through `viewport.scroll`, like the wheel). The slice on
screen is highlighted and the column scrolls to keep it in view, whatever moved
it: wheel, keys, scrollbar or cine. The column is scrolled directly rather than
with `scrollIntoView`, which would also scroll the overflow-hidden layout around
the viewer.

- **Drawing.** `lib/renderImageToCanvas`, which renders with the image's own
  window/level through Cornerstone's `renderToCanvasGPU`, on its internal
  `_thumbnails` rendering engine. It loads through the image cache, so a frame
  the stack already loaded or is loading isn't downloaded again. It's used
  rather than `loadImageToCanvas`, which swallows render errors into an
  uncaught rejection (an error toast) and crashed on PT series with an
  identity rescale; see the module's header.
- **Lazily.** Each thumbnail is drawn once it comes within 300px of the visible
  part of the column (an `IntersectionObserver` on the list), so a long stack
  only draws what the curator scrolls to.
- **Shape.** The thumbnails take the shape of the slice on screen (height/width,
  limited to 0.5–1.6), so they're listed only once the first slice is up.
- **Layout.** The column is rendered as soon as the stack viewer mounts, so the
  image pane is laid out at its final width from the start. The list has a zero
  flex basis, so its height never counts toward the viewer's.

### 2.5 Resizing

Drag the strip between the image and the column, which grows or shrinks the
thumbnails. It goes from 6rem to half the viewer and starts at 7.5rem. The limits
are in the stylesheet, with the handler keeping a dragged width from going
negative (ignored) or wider than half the viewer (the layout around it would
grow, and the 50% limit with it).

- **While dragging,** the width is set on the element directly and the
  thumbnails are scaled by CSS. Storing it on every move would re-render every
  thumbnail. Each move fires the window `resize` event the side panels use, so
  the image's canvas follows.
- **The image stays fitted.** Cornerstone's `resize(true, true)` keeps the
  camera, which crops the image once the pane is narrower than it. So
  `useRendererResize` puts a stack's zoom back afterwards, relative to the pane's
  new fit. That also applies to window resizes and the side-panel buttons, and
  it leaves a curator's own zoom and pan in place. Volume panes aren't stack
  viewports, so they aren't affected.
- **On release,** the width goes into the `sliceBrowserWidth` option, kept across
  exams through `PRESERVED_ON_RESET`, and thumbnails near the visible part of the
  list are redrawn if they now need more pixels. The others are redrawn when
  scrolled to, and a narrower column redraws nothing.
- **Redraws of a slice run one at a time.** `renderToCanvasGPU` keys its temporary
  viewport on the image id, and a second draw that overlaps the first never
  finishes. They draw off screen so a thumbnail doesn't flash black.

`getRenderingEngines()[0]` is still the app's `re1` engine: Cornerstone sorts
engines whose id starts with `_` last.

## 3. Not changed

- Volume panes: no keys, counter, cine or thumbnails.
- No keyboard shortcut for Play/Pause.
- The column's width isn't kept across a page reload, and it can't be resized
  from the keyboard.

## 4. Testing

Manual. No automated tests were added.

1. Open a multi-slice stack exam (e.g. a DBT series). The thumbnail column sits
   right of the image with Play and "5 fps" on top, and "1 / N" in the pane's
   top-right corner.
2. Press Down, Up, PageDown, PageUp, End and Home. The slice, counter,
   scrollbar thumb and highlighted thumbnail all follow, and the column scrolls
   to keep the highlighted one in view.
3. Click a thumbnail: that slice shows.
4. Press Play: the slices loop at 5 fps. Change the speed while playing: it
   keeps playing at the new speed, and Up/Down still step slices afterward.
   Press Pause: it stops.
5. Press Left/Right while playing: the next/previous IEC loads and nothing keeps
   playing.
6. Scroll the column to the bottom of a long stack: thumbnails are drawn as they
   come into view.
7. Open a single-slice stack: no column, no counter.
8. Drag the strip left of the column. The column and thumbnails grow, the image
   pane narrows and the image stays fitted, and the highlighted thumbnail stays
   in view. It stops at half the viewer one way and at 6rem the other. On
   release, wider thumbnails sharpen.
9. Press Right: the next exam opens with the column at the same width.
10. Repeat 1–4 and 8 on a Mask and a Mask Review stack exam.

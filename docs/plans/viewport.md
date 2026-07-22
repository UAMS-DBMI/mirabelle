# Viewport — cameras, overlays, pane chrome

Component area: the four render panes of the VR routes (three 2D ortho panes +
one 3D volume pane, plus the Stack pane in stack routes), their cameras, and
the DOM overlays drawn on top of them.

Anchor files:

- `src/lib/viewportFrame.js` (~431 lines) — DOM overlays: the data-boundary
  frame and the 2D mask-selection box. Created in `42df9b3`, evolved in
  `9f75870` and `dadff74`.
- `src/lib/viewportView.js` (~302 lines) — camera/framing helpers shared by
  viewport setup, the reset button, and expand/minimize. Created in
  `b75c776`, extended through `864b4a9`/`cfb69b7`. Has unit tests
  (`viewportView.test.js`) for its pure orientation math.

All commits below are on the branch stack and contained in `iec-list`.

---

## Task: "Viewport edges are now displayed so curators can see the limits of their selections"

**Status: implemented** (shared masking segment, `42df9b3`..`9f75870`).

`viewportFrame.js` draws **two distinct overlays**, both plain DOM `<div>`
borders — deliberately not vtk actors and not SVG. The in-code rationale: DOM
borders can't be clipped by the viewport's slab and are trivial to style, and
Cornerstone won't draw a labelmap outline where a mask meets the image edge
(there's no "outside" voxel there), so an edge-to-edge selection would
otherwise have no visible outline at all.

### Overlay A — data-boundary frame (`attachDataFrame`, viewportFrame.js:205-233)

This is the "viewport edges" of the task: a faint blue frame outlining the
**image/volume data bounds** — the drawing limits.

- Appends `div.viewport-data-frame` to the Cornerstone host element.
- `update()` reads `viewport.getImageData().imageData`, takes the volume
  extent from `getDimensions()`, and builds the 8 world corners of the box
  spanning `[-0.5 … size-0.5]` on each axis (the outer face of the outermost
  voxels) via `boxWorldCorners` (viewportFrame.js:39-49).
- The div is positioned from the canvas-space bounding rect of those corners
  (`canvasRect`, viewportFrame.js:52-65, using `viewport.worldToCanvas`).
- Restyled in `VolumeViewport.css:20-27`: 2px `rgba(147,197,253,0.2)` border,
  `pointer-events: none`, `z-index: 10`.

### Overlay B — mask-selection box (`addMaskBox2D`, viewportFrame.js:241-325)

The selection's own edges: a green box positioned from the IJK min/max bounds
of the current selection, with 8 draggable resize handles
(`attachBoxInteractions`, viewportFrame.js:345-425). Detailed in
[mask-selection.md](mask-selection.md); listed here because it shares the
overlay mechanism and z-order (`z-index: 11`, handles at 12).

### Tracking camera changes

Both overlays re-run `update()` on every Cornerstone
`Enums.Events.IMAGE_RENDERED` on the element (registered at
viewportFrame.js:226 / :307, with matched cleanup). Every position goes
through `viewport.worldToCanvas`, so pan, zoom, and slice scrolls reposition
the overlays automatically — no camera listener of their own. The mask box
additionally gates itself by slice (`sliceIntersectsCorners`,
viewportFrame.js:69-87): it hides on slices the selection doesn't cover
(stack panes pass `gateBySlice: false`).

### Where it's mounted

2D panes only: `VolumeViewport.jsx:294` (the three ortho panes) and
`StackViewport.jsx:192`. The 3D pane gets neither overlay — its selection
visual is a real vtk box actor (`addMaskBox` in `src/lib/maskBox.js`, see
mask-selection.md).

### Relation to selection clamping

The data frame is the **visual counterpart of the selection clamp**:
`ClampedRectangleScissorsTool` (`src/lib/clampedRectangleScissors.js`) clamps
every drag point into `[0, size-1]` IJK, i.e. exactly the box the frame
draws. Curators see the boundary their selection cannot cross. If the
rectangle-ROI implementation replaces the scissors (see mask-selection.md),
the data frame stays valid — it reads only image geometry, not tool state.

### Gaps / notes

- On CPU-rendered viewports (`imageData.indexToWorld` absent) the overlays
  silently skip drawing (viewportFrame.js:38-48, :221) — acceptable fallback,
  but worth knowing during debugging.
- No 3D-pane equivalent of the data frame (the 3D box actor covers only the
  selection, not the data bounds). Probably fine; flag if curators ask.

---

## Task: "A reset-camera button was added to restore zoom and pan in all viewports"

**Status: implemented** (`b75c776` created the button + `resetViewportsView`;
`6727c5d` renamed it "Reset Camera" and upgraded the 3D handling; `864b4a9`
coordinated it with the 3D camera-snapshot cache).

### The button

`ToolsPanel.jsx:210-225` — a `MaterialButtonSet` labeled "Reset Camera:" with
a single one-shot button `Reset Zoom & Pan` (icon `restart_alt`, `noRemember`
so it doesn't latch like a mode toggle) calling `resetViewportsView()` from
`@/lib/viewportView`. It is inlined in ToolsPanel, not built via
`toolsConfig.js`; visibility is the Redux presentation flag
`resetToolGroup.visible` (default off, `presentationSlice.js:116-119`),
enabled in the three VR route reducers (presentationSlice.js:230, :285,
:325).

### What reset does (`resetViewportsView`, viewportView.js:161-186)

One click iterates every viewport of the rendering engine:

- **2D/stack panes** (viewportView.js:177-184):
  `resetCamera({ resetPan: true, resetZoom: true, resetToCenter: false,
  storeAsInitialCamera: false })`, then `setZoom(MARGIN_ZOOM)` and render.
  `resetToCenter: false` keeps the current slice — only zoom and in-plane pan
  reset. `MARGIN_ZOOM = 0.92` is the same slight zoom-out applied at load, so
  reset restores the exact load-time framing (that shared constant is why
  `viewportView.js` exists).
- **3D pane** (viewportView.js:170-175, detected via `coronal3d` id prefix):
  `applyViewOrientation(viewport.options.orientation)` — restores the
  load-time orientation (undoing trackball rotation) and refits in one call.
  Added in `6727c5d`; before that the 3D pane went through the 2D path and
  kept its rotation.

### Coordination with expand/minimize (864b4a9)

`resetViewportsView` clears the `lastGood3dCameras` snapshot map before
resetting (viewportView.js:167-168) so a later expand/minimize refit doesn't
restore the pre-reset 3D view. The two features share that Map deliberately.

### Gaps / notes

- Reset is all-panes-at-once; there is no per-pane reset. Fine for now.
- Naming: UI says "Reset Zoom & Pan" but the 3D pane also resets rotation —
  minor copy inconsistency to settle when we polish.

---

## Context: other viewport work on these branches

These share the component and constrain future changes.

- **Tilted/oblique images fix** (`c667be7` v1, rewritten in `d8ddc07`):
  2D panes used to face *world* axes, so oblique/gantry-tilted acquisitions
  rendered tilted and — critically — broke the 1:1 IJK↔screen-rectangle
  mapping that the selection overlays assume. `acquisitionPaneOrientation`
  (viewportView.js:122-141) now cameras each pane onto the **volume's own
  voxel axes**: `paneAxisAssignment` (viewportView.js:65-82) picks the joint
  axis bijection (from 6 permutations) maximizing summed |dot| with the
  anatomical normals — jointly, so the three panes always slice three
  *distinct* voxel axes, even for compound-oblique volumes; up-vectors snap
  to the closest remaining axis, sign-flipped to stay anatomically upright.
  The orientation is stored on `viewport.options.orientation`,
  `viewportProperties.orientation`, *and* via `setOrientation(...)` so every
  later implicit `resetCamera` restores it. Axis-aligned volumes get exactly
  the world cameras. Unit-tested (11 cases in `viewportView.test.js`,
  including RAS-flipped NIfTI and compound-oblique fixtures).
- **Viewport labels** (`d8ddc07`, `ViewportLabel.jsx`): corner badges
  ("Axial"/"Coronal"/"Sagittal"/"3D"/"Stack"), rendered as React children of
  the Cornerstone host (safe — Cornerstone only appends its own element),
  `pointer-events: none`, `z-index: 13` (above the overlays).
- **Active viewport outline** (`cd836cc`): Redux `state.options.viewport`
  set via `onMouseDownCapture` in each viewport component; drawn as a
  `.viewport::after` inset border in `RouteLayout.css` (hover = dim blue,
  active = bright blue, `pointer-events: none`).
- **Slice scrollbar** (`d816273`, `src/lib/sliceScrollbar.js`): right-edge
  track + thumb showing slice position ("n / total"), draggable to scrub
  (`viewport.scroll(delta)`, left-button only). Updates on `IMAGE_RENDERED`
  like the overlays. Attached only in `VolumeViewport.jsx` (not stack/3D).
  Hidden until pane hover, `z-index: 15`.
- **Expand viewport button** (`cfb69b7`, `ViewportExpandButton.jsx`): corner
  toggle (icons `open_in_full` ⇄ `close_fullscreen`) sharing one code path
  with the double-click gesture — `toggleViewportExpanded`
  (viewportView.js:281-302) minimizes siblings to ~1px, toggles `.expanded`,
  `renderingEngine.resize(true,true)` + render. Not on the Stack pane (it
  fills its route alone). All its handlers `stopPropagation` so expanding
  doesn't also fire tools/active-pane selection.
- **3D black-pane fix + camera preservation** (`64ef360` v1, `864b4a9` v2):
  all panes share one offscreen WebGL context; restoring a ~1px-minimized
  layout brought the 3D pane back black with a degenerate camera. Current
  fix (`refit3dViewportsAfterResize`, viewportView.js:253-270): deferred to
  `requestAnimationFrame`, does a **full `resetCamera()`** (the only
  reliable way to clear the black pane), then re-applies the pre-toggle
  snapshot from `lastGood3dCameras` if it passes `isUsableCamera` — snapshots
  are only ever captured while the pane is at real size (≥8px). Net: black
  pane cleared *and* the user's 3D view preserved.

## Known issues / risks in this area

- The 3D shared-WebGL recovery is a worked-around Cornerstone/browser quirk,
  not a clean fix — the `.minimized` 1px trick and the rAF timing are
  load-bearing (comments at viewportView.js:250-251, VolumeViewport.css:13).
  A Cornerstone upgrade could shift this behavior; retest expand/minimize
  when bumping.
- `commitResize`/`commitStackResize` (MaskIEC.jsx:701-741) rewrite hidden
  labelmap state and rely on selection bounds only ever growing — a
  documented assumption, not enforced (also flagged in mask-selection.md).
- Fast-navigation "segmentation not ready" races are guarded defensively in
  several places (e.g. MaskIEC.jsx:676-681); see iec-navigation.md.

## Open questions for discussion

1. Do we want a data-bounds frame (or any bounds cue) in the **3D pane**?
2. Per-pane reset vs. the current all-panes reset — any curator demand?
3. Should the slice scrollbar extend to the Stack pane for consistency?

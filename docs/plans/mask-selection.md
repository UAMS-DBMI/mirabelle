# Mask Selection — selection tool, live preview, drafts

Component area: the rectangle mask selection curators draw to define the
masking cuboid — drawing, moving/resizing, live rendering across panes,
clamping, persistence across IECs, and load gating.

**The central decision in this area:** two competing implementations exist.

- **Current (on the `iec-list` stack):** scissors-painted labelmap + overlay
  boxes with hand-rolled drag handles. Built up through `42df9b3`, `9f75870`
  (resizable), `dadff74` (live preview in all viewports), `bcbcf3f` (live
  selection while drawing).
- **Alternative (branch `masking-rectangle-roi`, commit `d989880`):** native
  Cornerstone `RectangleROITool` annotations reconciled into a shared 3D
  cuboid. Forks from `b75c776` — it does **not** contain
  `masking-improvements`, `ui-loading-improvements`, or `iec-list` work.
  The two are divergent paths from the same base, not base+patch.

File provenance: `clampedRectangleScissors.js` created `42df9b3`, live-draw
broadcast added `bcbcf3f` · `maskBox.js` created `8a2d300` · resize handles in
`viewportFrame.js` from `9f75870` · `maskDrafts.js` created `0dadff1`
(iec-list only) · `maskRectangleRoi*.js` exist only on `d989880`.

---

## Task: "The mask selection is movable and resizable, with changes rendered live in all the viewports"

**Status: implemented — twice.** Both variants are movable and resizable.
A decision between them is needed before further investment.

### A. Current implementation (iec-list stack)

**Design principle** (documented at MaskIEC.jsx:572-583, maskBox.js:1-10):
the selection is always a cuboid defined by the labelmap's **IJK bounding
box** — the raw painted labelmap is hidden and clean box overlays are drawn
instead. Bounds come from the voxel manager's tracked `boundsIJK` for volumes
(`getLabelmapBounds`, utilities.js:87-103, O(1)) or by scanning painted
pixels for stacks (`getCoordsForStackSeg`, utilities.js:20-63).

**Drawing:** `ClampedRectangleScissorsTool`
(clampedRectangleScissors.js:93-116) subclasses the stock
`RectangleScissorsTool`, registered under the stock name and wired as the
SELECTION left-click tool (toolsManager.js:57, 90-92, 146). A drag paints the
labelmap on mouseup.

**Rendering:** one overlay-render effect (MaskIEC.jsx:584-815) re-runs
`refreshSelectionBoxes` on every `SEGMENTATION_DATA_MODIFIED`. Per viewport:

- 3D pane → `addMaskBox` (maskBox.js:79-112): an **explicit vtk box actor**
  (8 corners + 6 quad faces), not a labelmap isosurface — marching cubes
  can't produce a surface at the grid edge, so a full-volume mask would be
  invisible; the explicit box always reaches the true edge. Corners expanded
  half a voxel to sit on voxel boundaries. Note: the current `addMaskBox`
  **rebuilds the actor on every call** (removes + reallocates).
- 2D panes → `addMaskBox2D` (viewportFrame.js:241-325): plain DOM `<div>`
  repositioned via `worldToCanvas` on every `IMAGE_RENDERED` (tracks
  zoom/pan/scroll), slice-gated for volumes so it hides on slices the box
  doesn't cover.

**Move/resize:** `attachBoxInteractions` (viewportFrame.js:345-426) — drag
the box body to move (`translateBound`, clamped in-volume), 8 handles to
resize (`setBound`, clamped to `[0, dimSize-1]`, can't cross the opposite
bound). Each pane edits only its two in-plane IJK axes
(`inPlaneAxisMapping`, viewportFrame.js:121-152); depth is left to the other
panes. Handlers are only wired while SELECTION is the active left-click tool
(MaskIEC.jsx:763-768) — under window-level/crosshairs the box is frozen and
click-through.

**Commit:** volume resize → `voxelManager.setBounds` + fire
segmentation-modified (`commitResize`, MaskIEC.jsx:701-712; never rewrites
voxels). Stack resize → clear and re-paint labelmap rectangles on covered
frames (`commitStackResize`, MaskIEC.jsx:720-741).

**Live cross-pane/3D sync — two channels:**

1. **Drag of an existing box:** `onLiveResize` fires per mousemove →
   `schedulePreview` (MaskIEC.jsx:627-632) coalesces to one
   `requestAnimationFrame` → `drawPreviewBoxes` pushes in-progress coords to
   the 3D actor and to the other 2D panes via `element.__maskBox2dSetLive`.
2. **Fresh rectangle draw:** scissors only paints on mouseup, so
   `_dragCallback` broadcasts `MASK_LIVE_DRAW_EVENT` per drag step with
   in-progress IJK bounds (clampedRectangleScissors.js:63-91, 105-111);
   `handleLiveDraw` (MaskIEC.jsx:650-671) merges with committed bounds (so
   extending onto a new slice doesn't preview as a shrink) and schedules the
   same preview. This was `bcbcf3f`.

### B. Alternative implementation (`masking-rectangle-roi`, d989880)

Selection = native **`RectangleROITool` annotations**; no scissors, no
painted labelmap pixels. Master switches `USE_RECTANGLE_ROI_FOR_STACK` /
`_VOLUME` both default true.

- **Tool subclass** `MaskRectangleRoiTool` (maskRectangleRoiTool.js): wraps
  the stock instance methods after `super()` — green translucent fill behind
  the outline (SVG rect), `isPointNearTool` treats any interior point as
  "near" (click-anywhere-inside to move; stock only grabs the border),
  `addNewAnnotation` returns the existing annotation (one box per pane),
  stats text disabled. **Resize handles and move come natively** from
  RectangleROITool — no hand-rolled handle DOM.
- **Volume reconciliation** (`createVolumeRoiController`,
  maskRectangleRoiVolume.js): single source of truth `box = {i,j,k}`, each
  axis null until pinned. Each ortho pane owns two in-plane axes (Axial→i,j;
  Coronal→i,k; Sagittal→j,k). On `ANNOTATION_MODIFIED`/`_COMPLETED`: read
  the rect's world corners → fold that pane's two axes into `box` → when all
  three axes set, commit to the segmentation volume's
  `voxelManager.setBounds` → re-anchor every other pane's rectangle to the
  new cross-section → schedule the 3D actor redraw (one rAF). A `syncing`
  flag prevents reacting to its own edits. Rectangles re-anchor per slice on
  `IMAGE_RENDERED` so the box overlays every slice. Until a pane's axes are
  known it shows no rectangle (prevents a one-pane draw ballooning into a
  full-height box elsewhere).
- **3D actor updated in place:** the sibling modifies `addMaskBox` to mutate
  the existing polyData's 8 points when the actor exists, instead of
  rebuilding — its answer to the same perf problem `schedulePreview`
  addresses.
- **Stack:** stock `RectangleROITool` + `AnnotationMultiSlice` frame-range
  metadata (start/end slice) — one rectangle rendered across the frame
  range; `[` / `]` hotkeys narrow the range; first draw defaults to the
  whole stack. `getStackRoiCoords` assembles the IJK cuboid. **Never paints
  labelmap pixels.**
- **Wiring:** toolsManager gains a `useRoi` flag; the DOM-overlay effect in
  MaskIEC early-returns under ROI; Clear/Accept gain ROI branches; the
  selection tool activates **immediately, even while loading** (an ROI needs
  no segmentation) — see the Task 4 conflict below.

### Comparison for the decision

| | Current (scissors + overlays) | Rectangle-ROI (d989880) |
| --- | --- | --- |
| Selection model | painted labelmap, IJK bounds are derived | annotation is the selection; bounds committed to voxelManager |
| Move/resize | custom DOM handles (8) + body drag | native handles + interior-click move |
| Live sync | two custom channels (live-draw event + onLiveResize/rAF) | native ANNOTATION_MODIFIED stream + rAF |
| 3D actor | rebuilt per preview frame | mutated in place |
| Clamping during drag | yes (event-point clamp) | no — clamp only at read time; handles can visually overshoot |
| Stack representation | painted pixels per frame | frame-range metadata, no pixels |
| Works before segmentation loads | no (needs segmentation) | yes (deliberately enabled while loading) |
| Contains later stack work (drafts, queue, loading UX) | yes | no — needs rebase/merge |
| Custom code carried | ~700 lines of overlay/handle code | ~790 new lines, but drops handle DOM; leans on stock tool behavior |

**Recommendation to discuss:** regardless of which model wins, take the
sibling's in-place `addMaskBox` update — it benefits the current branch's
preview path too.

---

## Task: "A selection cannot exceed the limits of the viewport"

**Status: implemented — clamped to image/volume data bounds** (not the canvas
rectangle; the task wording says "viewport" but every clamp is against the
voxel grid extent, which is the meaningful limit).

Clamp sites on `iec-list`:

1. **Fresh draw** — `clampWorldPointToVolume`
   (clampedRectangleScissors.js:32-56) mutates the event's world point
   *before* the stock mouse-down/drag callbacks consume it: world→index,
   clamp each axis to `[0, size-1]`, back to world. Clamping in index space
   works for oriented/oblique volumes too.
2. **Handle resize/move** — `setBound` / `translateBound`
   (viewportFrame.js:164-181) clamp to bounds and forbid crossing the
   opposite edge.
3. **Draft restore** — `applyBoundsToVolumeLabelmap` re-clamps to current
   volume dims (maskDrafts.js:65-79) in case the draft was saved at a
   different decimation.

The visual counterpart is the data-boundary frame (`attachDataFrame`) that
draws the clamp box — see [viewport.md](viewport.md).

**Caveats / gaps:**

- Nothing constrains the box to the *visible* canvas — zoom/pan can push a
  (validly clamped) box partly off-screen. If the task really means visible
  viewport, that's unbuilt (and probably undesirable).
- On the rectangle-ROI branch, the native drag is **not** clamped — only the
  read-time bounds are. The visible rectangle/handles can overshoot the
  image edge. Adopting ROI while keeping this task's guarantee means adding
  clamping to the ROI drag/handle callbacks.
- The current clamp relies on the stock scissors deriving its rectangle from
  the (clamped) current point — a future tool change could silently leak.

---

## Task: "Mask selections are now preserved across IECs during navigation"

**Status: implemented on `iec-list`** (`0dadff1`, `src/lib/maskDrafts.js` +
MaskIEC wiring + IecQueue surfacing).

- **What's persisted:** the IJK bounding box only (`{i:{min,max}, j, k}`) —
  not voxels, not mask parameters. Stored in a **module-level in-memory
  `Map`** keyed by `String(iec)` — tab-lifetime only, by design (not Redux,
  not localStorage; does not survive reload). maskDrafts.js:6-18.
- **Save points:** (a) load-effect cleanup on every navigation, before the
  segmentation is torn down (MaskIEC.jsx:508); (b) live on every
  `SEGMENTATION_DATA_MODIFIED` (MaskIEC.jsx:822-838) so the queue marker
  appears the instant something is drawn. Empty bounds **delete** the draft
  so a cleared selection can't resurrect (maskDrafts.js:133); a not-yet-
  existing segmentation is a no-op so navigating away mid-load can't destroy
  an earlier draft (:115).
- **Restore:** on `VolumeReallyLoaded`/`StackSegmentationReady`, once per
  load (`draftRestored` flag, MaskIEC.jsx:311-331) — volume: write
  `voxelManager.setBounds` re-clamped to current dims; stack: paint the
  covered labelmap pixels; then fire segmentation-modified so the boxes
  redraw (maskDrafts.js:159-172).
- **Drop points:** Accept, Skip/Non-maskable, Clear all `forgetMaskDraft` and
  set `skipDraftSaveRef` so the cleanup save doesn't re-persist the box
  (MaskIEC.jsx:862-894).
- **Queue surfacing:** `IecQueue.jsx` subscribes via `useSyncExternalStore`
  to an immutable membership snapshot (only add/remove notifies, not bound
  edits — maskDrafts.js:25-42); draft rows get a green brush icon
  (IecQueue.jsx:141-147) and there's an "Active mask" filter chip
  (IecQueue.jsx:443-452) that falls back to "all" when the last draft
  disappears.

**Conflicts with the rectangle-ROI alternative (important for the decision):**

- **Volume:** ROI still commits to `voxelManager.setBounds`, so saved drafts
  survive — but restore fires `SEGMENTATION_DATA_MODIFIED`, which the ROI
  controller doesn't listen to. A restored box would show the 3D actor but
  **no editable per-pane rectangles** until redrawn. Restore would need to
  rebuild annotations through the controller.
- **Stack: outright broken.** ROI stacks never paint pixels, so
  `getCoordsForStackSeg` returns null → nothing is ever saved; and restore
  paints pixels that `getStackRoiCoords` never reads. Drafts would need to
  serialize the annotation (i/j corners + k frame range) instead.
- The queue's "Active mask" marker keys off `SEGMENTATION_DATA_MODIFIED`,
  which the ROI stack path never fires — the marker would never light up.

---

## Task: "The selection tool is disabled while an image is still loading"

**Status: implemented** (`3f028d7`, refined later on the stack). Premise: the
scissors needs an *active segmentation*, which exists only after load;
drawing earlier threw "No active segmentation detected".

- Redux default left-click flipped to SELECTION (presentationSlice.js mask
  config) so window-level no longer steals left-click on every load.
- `toolsManager.js:187-191`: at mount, if the default mode is SELECTION,
  `disableLeftClick()` — nothing is bound to left-click at all while
  loading.
- The Selection button is disabled via `selectionReady` state
  (toolsConfig.js:102, ToolsPanel.jsx:104), flipped true when viewports fire
  `AllowSegmentationDrawing` after their segmentation is active; the handler
  first ensures the segmentation is active on every 2D pane, then binds the
  scissors (ToolsPanel.jsx:127-170).
- Reliability backstops added later: re-trigger on
  `VolumeReallyLoaded`/`StackSegmentationReady` (MaskIEC.jsx:211-271);
  MaskIEC.jsx:465-478 force-activates the segmentation on all 2D panes after
  guaranteed creation (per-viewport ready events can miss on cached loads);
  ToolsPanel keyed on `iec` + `managerRef` so navigation can't arm scissors
  on a destroyed tool group.

**Conflict:** the rectangle-ROI branch **deliberately does the opposite** —
`selectionReady = manager.useRoi || scissorsReady`, tool active during load
(an ROI needs no segmentation). If ROI is adopted, this task is obsolete as
stated; decide whether "usable during load" is a feature (probably yes) or
whether some gating should remain (e.g., until geometry is known).

---

## Cross-cutting: how the selection reaches the backend

`handleAccept` (MaskIEC.jsx:960-1016): volume → `getLabelmapBounds`,
validated non-empty and a real 3D box (not a single plane); stack →
`getCoordsForStackSeg`. Then `submitFinalCoords` (masking.js:119-203) builds
the 8 voxel corners, converts via `spacing` to mm, computes center
(`lr/pa/is`) + dimensions (`width/height/depth`), and POSTs
`/papi/v1/masking/{iec}/parameters`.

**Flag for the team:** Accept **posts parameters only** — it never calls
`setMaskingStatus(iec, "accept mask")` (that path exists in
masking.js:27-50 but is invoked only for skip/non-maskable,
MaskIEC.jsx:870). Either the backend treats a parameters POST as acceptance,
or an accept-status POST is missing. Verify with the backend team.

Also note: submitted coordinates are **decimation-dependent** (IJK of the
loaded, possibly decimated volume × that volume's spacing); maskDrafts
already documents the mismatch risk when restoring across different
decimation values (maskDrafts.js:60-64).

## Known bugs / TODOs in this area (from code comments)

- Magic string event names (`AllowSegmentationDrawing`, `VolumeReallyLoaded`,
  `StackSegmentationReady`) — TODO at MaskIEC.jsx:227-228 to collect into a
  library.
- Clear works around a Cornerstone bug by swapping in a new randomly-named
  segmentation; the `updateSurfaceData` error for the old one persists
  (MaskIEC.jsx:906-913). Related crash-guard branch exists:
  `fix/polyseg-update-surface-crash`.
- Debug globals (`window.ToolGroupManager` etc., MaskIEC.jsx:286) and live
  `console.log`s in the render/load path (MaskIEC.jsx:145-150).
- `masking.js:10` dead-ish `loaded` singleton TODO; commented-out debug
  blocks (masking.js:80, 98-116).

## Decision points for discussion

1. **Scissors vs rectangle-ROI** — the core choice. ROI is less custom code
   and natively interactive, but as written it breaks stack drafts, the
   queue draft marker, drag-time clamping, and inverts the
   disabled-while-loading behavior; it also predates (and would need
   rebasing onto) all the masking-improvements/ui-loading/iec-list work.
2. If ROI wins: port drafts to annotation serialization, add drag-time
   clamping, define load-time behavior, rebase onto `iec-list`.
3. If scissors wins: cherry-pick the in-place `addMaskBox` update from
   `d989880`; consider whether native-handle UX is worth emulating further.
4. Clarify the accept-status question with the backend.

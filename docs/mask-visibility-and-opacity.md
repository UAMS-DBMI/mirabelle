# Mask Show/Hide and Opacity — Implementation Notes

The Mask controls in the tools panel: an eye toggle that shows or hides a box,
and a slider that sets how strongly it is drawn — one pair for the green
selection box, one for the amber box of the mask already submitted for this exam
(§7). They change **appearance only** — the selection bounds live in the
labelmap and are never touched, so accepting an exam with the box hidden submits
exactly what was drawn.

**Audience:** developers working on the mask route. Companion to
[masking-improvements.md](masking-improvements.md), which covers
how the box itself is drawn; this document covers how these two controls reach
it.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx) | The control surface: eye button + slider |
| [src/features/presentationSlice.js](../src/features/presentationSlice.js) | `maskToolGroup` — range, step, which routes show the control |
| [src/features/optionSlice.js](../src/features/optionSlice.js) | `maskOpacity` / `maskVisible` (and the `prevMask*` pair) state, and their exemption from `resetOptions` |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Consumes both: teardown-on-hide, style-only opacity effect, per-exam restore/save |
| [src/features/mask/usePreviousMaskOverlay.js](../src/features/mask/usePreviousMaskOverlay.js) | The submitted mask's overlay as a hook — geometry resolution, draw/teardown, slider restyle — mounted by MaskIEC, MaskReviewIEC and DicomReviewIEC (§7) |
| [src/lib/maskBox.js](../src/lib/maskBox.js) | 3D: opacity → two shader fill alphas (wireframe edges stay full) |
| [src/lib/viewportFrame.js](../src/lib/viewportFrame.js) | 2D: opacity → fill `background` alpha (border and handles stay full) |
| [src/lib/maskViewPrefs.js](../src/lib/maskViewPrefs.js) | Per-exam memory of all four values |
| [src/lib/maskingParameters.js](../src/lib/maskingParameters.js) | The submitted mask's stored geometry (mm) → IJK bounds (§7) |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) / [StackViewport.jsx](../src/components/StackViewport.jsx) | Colour the mask segment green so the scissors' drag rectangle matches the box (§4.4) |

---

## 1. The control surface

[ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx) renders a row per box —
an eye button and a range input, with a readout that shows either the percentage
or the word `hidden`. **Mask Opacity** drives the live selection; **Submitted
Mask Opacity** drives the previously submitted mask's box; it is on the panel
for every mask exam, and goes inert (readout `none`) on exams that have no
submitted mask (§7).

```jsx
Mask Opacity: {maskVisible ? `${Math.round(maskOpacity * 100)}%` : "hidden"}
```

(The neighbouring volume control is labelled **Volume Opacity** — same reason:
three sliders in one panel, each has to say what it acts on.)

Both dispatch `setOption` and nothing else — the panel holds no state of its own,
which is what lets the route restore a remembered value by dispatching into the
same store (§5).

Two details worth keeping:

- **The slider is `disabled` while the box is hidden.** A hidden box cannot show
  a change in opacity, so leaving it live would let the curator drag a control
  with no visible effect and then wonder why. Hiding is the coarse control;
  opacity is the fine one, and it only makes sense under it.
- **The readout collapses to `hidden`.** Showing `40%` next to a box that isn't
  on screen is worse than showing nothing.

`maskToolGroup` ([presentationSlice.js:110](../src/features/presentationSlice.js#L110))
carries `min: 0, max: 1, step: 0.05` and starts `visible: false`. Only the mask
route flips it on ([presentationSlice.js:248](../src/features/presentationSlice.js#L248)) —
it is the only route that draws a selection box, so it is the only one that gets
the controls. Note that this is a *different* control from the existing
`opacityToolGroup`, which drives the 3D volume's scalar opacity (the anatomy);
these two sit next to each other in the panel and are easy to confuse in code.

---

## 2. State

```js
// optionSlice.js:19
maskOpacity: 0.5,   // 0–1
maskVisible: true,
```

`0.5` / `true` is the starting point: the glass reads clearly as a solid
region while the anatomy inside it stays legible, which is the state a curator
checks a selection in. Full opacity is a deliberate "show me what the mask
does" move (§4.3), not something worth having to undo on every exam.

**Three places hold this default and must move together:** `maskOpacity` here,
`maskToolGroup.defaultValue`
([presentationSlice.js:110](../src/features/presentationSlice.js#L110)), and
`DEFAULT_MASK_VIEW` ([MaskIEC.jsx:113](../src/features/mask/MaskIEC.jsx#L113)),
which is what an unadjusted exam is restored to (§5). Let them drift and an
exam opens at one value while the panel reads another.

The submitted mask's pair sits alongside them:

```js
prevMaskOpacity: 0.2,
prevMaskVisible: true,    // shown by default — but only where one exists
prevMaskAvailable: false, // set per exam by the route; gates the control (§7)
```

All five are in `PRESERVED_ON_RESET`
([optionSlice.js](../src/features/optionSlice.js)), so navigation's
`resetOptions()` leaves them alone. `prevMaskAvailable` earns its place
differently from the rest: it is per-exam state owned by the route (recomputed
on every load), but MaskVR resets options *before* asking the route to
navigate, and at the end of the queue that navigation never happens — a reset
here would kill the control for an exam that stays on screen, with nothing
left to recompute it.

That exemption is not cosmetic. The mask route resets options and *then*
navigates, so if the new exam id arrives even one
render later there is a render still showing the **old** exam with opacity
already snapped back to the default. The per-exam saver (§5) cannot distinguish
that from the curator moving the slider, and would record the default over the
value that exam actually had. Restoring is the restore effect's job alone;
`resetOptions` must stay out of it.

---

## 3. Two different delivery paths

This is the central design point. The two controls look symmetric in the UI and
are anything but in the code.

```
maskVisible ──► lifecycle effect dep ──► full teardown / rebuild of the overlays
maskOpacity ──► ref + style-only effect ─► restyle in place, no rebuild
```

### 3.1 Visibility tears down

`maskVisible` **is** a dep of the box lifecycle effect
([MaskIEC.jsx:906](../src/features/mask/MaskIEC.jsx#L906)):

```js
deps: [iec, segmentationId, volumeId, volumetric, leftClickTool, maskVisible]
```

Inside `refreshSelectionBoxes`, hiding takes the same branch as having nothing
selected ([MaskIEC.jsx:817](../src/features/mask/MaskIEC.jsx#L817)):

```js
if (!bounds || !maskVisible) {
  if (is3d) removeMaskBox(item);
  else removeMaskBox2D(item);
}
```

Hiding is genuine removal — the wireframe actor comes out of the scene, the
shader fill is disabled, the 2D divs are detached with their listeners. The
bounds stay in the labelmap either way, so unhiding runs a normal
`refreshSelectionBoxes()` and the box comes back exactly where it was.

Doing it as removal rather than "draw at alpha 0" is what makes the hidden state
actually free: no wireframe actor in the depth pass, no shader branch, no 2D
overlays repositioning on every `IMAGE_RENDERED`. On a heavy volume, hiding the
box is a real way to get the pane responsive again.

Two consequences follow from the removal being real:

- **`removeMaskBox` deletes the viewport's `FILL_BOXES` entry**
  ([maskBox.js:441](../src/lib/maskBox.js#L441)). `setMaskBoxStyle` re-applies the
  fill from that map, so without the delete a later restyle would resurrect the
  fill of a box the curator had hidden. `disableFill` also never *creates* the
  mapper — removal must not convert a viewport that was never filled.
- **The drag preview bails while hidden**
  ([MaskIEC.jsx:611](../src/features/mask/MaskIEC.jsx#L611)). `drawPreviewBoxes`
  returns early on `!maskVisible`; the overlays it would drive are already gone.

#### Starting a stroke while hidden un-hides the box

Hiding removes the overlays but does **not** disarm the scissors, and a fresh
stroke merges into the existing bounds rather than replacing them (§3.3 of the
companion doc). Left alone, that lets a curator grow a selection they cannot
see and then submit it — the one way these appearance-only controls could
change what gets masked.

The invariant is therefore: **editing restores visibility, at the moment edit
intent appears.** `ClampedRectangleScissorsTool` announces
`MASK_DRAW_START_EVENT` from its `preMouseDownCallback` (right after the stock
callback builds `editData`, which is where the `segmentationId` comes from),
and `handleDrawStart` dispatches `maskVisible: true` if the box is hidden. The
timing is the point:

- **At mouse-down, not on the first drag step.** An earlier version un-hid on
  the first `MASK_LIVE_DRAW_EVENT`, which only fires once the drag is moving —
  so the press and the first stroke segment still happened blind, and the box
  popped in mid-drag. Firing at press time puts the existing selection back on
  screen *before* any part of the stroke is drawn.
- **Un-hide, not disarm.** A disabled tool restores nothing and blocks the
  action, leaving the curator working out why drawing silently stopped;
  un-hiding restores exactly the feedback that was missing, exactly when it is
  needed.

`handleLiveDraw` keeps the same dispatch as a backstop for any stroke that
starts without a fresh mouse-down; same-value dispatches don't re-render, so
it costs nothing.

Re-running the lifecycle effect at press time (`maskVisible` is a dep) is
safe: the scissors' drag state lives in the Cornerstone tool, not in this
effect, and none of *our* handles can be mid-drag — the overlays that carry
them did not exist a moment ago.

### 3.2 Opacity does not

`maskOpacity` is deliberately **not** a dep of that effect. It reaches the effect
body through a ref instead:

```js
// MaskIEC.jsx:221
const maskOpacityRef = useRef(maskOpacity);
maskOpacityRef.current = maskOpacity;

// MaskIEC.jsx:556 — read at draw time, not captured
const box3dStyle = () => ({ ...SELECTION_BOX_STYLE.box3d, opacity: maskOpacityRef.current });
```

Routing the slider through the lifecycle effect made the control unusable: every
step ran the teardown (remove actors, drop listeners, cancel the rAF) and the
rebuild, which is **two full volume re-renders per slider step**, on a control
that emits a step every few pixels of drag. The slider changes a handful of
fill uniforms and one CSS `background`; it must not cost an actor rebuild.

The style-only effect ([MaskIEC.jsx:916–936](../src/features/mask/MaskIEC.jsx#L916-L936))
applies it:

```js
useEffect(() => {
  if (!segmentationId || !maskVisible) return undefined;
  let raf = requestAnimationFrame(() => {
    renderingEngine.getViewports().forEach((item) => {
      if (is3dViewport(item.id)) setMaskBoxStyle(item, { ...SELECTION_BOX_STYLE.box3d, opacity: maskOpacity });
      else if (is2dViewport(item.id)) item.element?.__maskBox2dSetOpacity?.(maskOpacity);
    });
  });
  return () => { if (raf) cancelAnimationFrame(raf); };
}, [segmentationId, maskVisible, maskOpacity]);
```

Coalesced to one application per animation frame with latest-value-wins: a fast
drag across the slider produces one restyle per frame, not one per step. The
cleanup cancelling the pending rAF is what implements "latest wins".

`maskVisible` is in this effect's deps too, and the early return means no
restyling happens while hidden — there is nothing to restyle. On unhide both
effects re-run in the same commit; the lifecycle effect (declared first) rebuilds
the boxes already carrying the current opacity via `box3dStyle()`, and this
effect's restyle lands on top as a no-op. The ref and the slider therefore cannot
drift apart across a hide/show cycle.

---

## 4. What "opacity" means, per renderer

**The slider fades the surfaces only.** The selection's *outline* — the 2D
border, the 3D wireframe edges — and the 2D drag handles hold full strength at
every slider position; what fades is the translucent middle. The reasoning:
the outline is how you find and grab the selection, the glass is how you judge
what it covers, and only the second is ever in the way of the anatomy. Fading
them together (the original design) meant turning the glass down also made the
selection progressively harder to find and grab, until the low end was an
invisible box with live handles. Hide is the all-or-nothing control: the eye
removes everything — edges, handles, fill — because its meaning is "the box is
in my way", not "less of the box".

The one 0–1 slider value therefore reaches two places, and their curves are
not the same.

### 4.1 The 2D overlays — background alpha only

`applyStyle` ([viewportFrame.js:344](../src/lib/viewportFrame.js#L344))
computes `frame.style.background` as `fillColor` at `fillAlpha × opacity`, and
`__maskBox2dSetOpacity(value)` re-runs it in place for the slider. Border
colour and the handles are untouched by the slider — deliberately **not**
element opacity, which would scale border, fill and handles as one (and an
element at `opacity: 0` still takes pointer events; see failure mode #9).

`fillColor`/`fillAlpha` come from `SELECTION_BOX_STYLE.box2d`; the base alpha
matches the stylesheet's `rgba(74, 222, 128, 0.18)` background
([VolumeViewport.css:32](../src/components/VolumeViewport.css#L32)), so slider
100% looks identical to the CSS default, and an overlay whose caller passes no
fill settings keeps the stylesheet look.

So in 2D the fill response is linear from nothing (outline only, at 0) to the
overlay's designed appearance (at 100%) — a translucent green rectangle you
can still see the anatomy through. The 2D pane is where the curator checks the
selection edge against the image, so it never becomes opaque.

### 4.2 The 3D wireframe — constant

`property.setOpacity(1)` at creation
([maskBox.js:385](../src/lib/maskBox.js#L385)), and `setMaskBoxStyle` leaves
it alone. The 12 edges delineate the selection at any slider position — the
3D counterpart of the 2D border staying solid.

### 4.3 The 3D fill — two non-linear alphas

The glass panes and the box interior are per-sample alphas in the patched volume
shader, and each has its own curve.

**Panes** — `fillAlphaForOpacity`
([maskBox.js:225](../src/lib/maskBox.js#L225)):

```js
clamped * (fillAlpha + clamped * (MAX_FILL_ALPHA - fillAlpha))
```

A plain `fillAlpha × opacity` product caps at `fillAlpha` (0.15), so the top of
the slider used to be barely-there glass — the curator could not turn the box up
past "faint". The quadratic ramp keeps the glass look through the low-mid range
and reaches `MAX_FILL_ALPHA` (0.97) at 100%. Just under 1, so a ray grazing along
a pane still darkens it — the cue that reads as glass rather than painted-on
plastic.

**Interior** — `coreAlphaForOpacity`
([maskBox.js:233](../src/lib/maskBox.js#L233)):

```js
MAX_CORE_ALPHA * smoothstep(CORE_FILL_START, 1, clamped)
```

Zero below 70%: the box is a hollow shell you inspect anatomy through. Above it
the middle progressively fills until the box is a solid block.

The interior exists because opaque faces alone aren't enough. A face clipped by
the volume edge leaves the region see-through, and **MIP presets** (the CT
default) colour only the single brightest sample along each ray instead of
accumulating along it — so the fill gets exactly one sample to assert itself
with. That is why `MAX_CORE_ALPHA` is 0.9 rather than faint. It costs nothing
under composite presets: by the time the interior engages the panes are already
≈94% opaque, so the ray stopped at the front face long before reaching the
middle.

Where the slider actually lands (composite column assumes ~4 samples cross a
2-voxel shell, i.e. `1 - (1-α)⁴`):

| Slider | Pane α/sample | Pane, accumulated | Core α/sample | 3D reads as |
|---|---|---|---|---|
| 0% | 0 | 0 | 0 | outline only — the wireframe stays |
| 25% | 0.089 | 0.31 | 0 | hollow glass |
| 50% (default) | 0.280 | 0.73 | 0 | hollow glass |
| 70% | 0.507 | 0.94 | 0 | hollow glass |
| 85% | 0.720 | 0.99 | 0.45 | filling in |
| 100% | 0.970 | 1.00 | 0.90 | solid block |

The design intent for the 3D pane: at the top of the slider the box stops being
a preview of *where* the mask sits and becomes a preview of *what the mask
does*. At the bottom it is a pure outline — the anatomy fully visible with the
selection still delineated, which is the inspection state the slider exists
for.

**The asymmetry is worth knowing about.** At 100% the 3D box is essentially
opaque while the 2D boxes are still translucent, because the 2D fill scales a
fixed base alpha (0.18) linearly and the 3D fill ramps to a near-opaque block.
Both fills are passed through the style objects (`box2d.fillColor`/`fillAlpha`
mirror `box3d`'s), so unifying the curves would only mean applying
`fillAlphaForOpacity` on the 2D side too.

**Slider 0 is safe because only surfaces fade.** At 0 the fill is gone but the
border, wireframe and handles are at full strength — an outline-only box,
clearly visible and grabbable. Earlier designs faded everything through one
element opacity, which made low slider values a trap: a CSS `opacity: 0`
element still takes pointer events, so the curator got resize cursors and
working handles over a selection they could not see, and a 0.05 (later 0.2)
floor only rationed the same problem. Splitting surface from outline dissolved
it — there is no slider position that hides the outline, so the slider needs
no floor at all. Making the box *go away* is the eye toggle's job, which
removes the overlays outright — and editing un-hides it (§3.1).

### 4.4 The scissors' drag rectangle — segment colour, not tool style

One state of the selection is drawn by neither `viewportFrame` nor `maskBox`:
the rectangle you see *while dragging a fresh stroke* belongs to the scissors
tool itself. Cornerstone colours it with the **segment's palette colour**,
captured once at mouse-down (`getSegmentIndexColor`), not with an annotation
style — so with the default palette the stroke previewed in a different colour
from the green box it was about to become.

Both viewport components therefore set the mask segment's colour to the
selection green where they register the labelmap representation
([VolumeViewport.jsx:178](../src/components/VolumeViewport.jsx#L178),
[StackViewport.jsx:138](../src/components/StackViewport.jsx#L138)):

```js
[1, 2].forEach((segmentIndex) =>
  segmentation.config.color.setSegmentIndexColor(
    viewportId, segmentationId, segmentIndex, [74, 222, 128, 255],
  ),
);
```

`[74, 222, 128]` is `SELECTION_EDGE_COLOR` in 0–255 — one selection, one
green, in every state: drag rectangle, 2D box, 3D wireframe, glass fill. Two
constraints worth keeping:

- **Order matters.** `setSegmentIndexColor` resolves the representation's
  colour LUT and throws if the representation doesn't exist yet — it must run
  *after* `addLabelmapRepresentationToViewport` (StackViewport's comment
  records the same rule).
- **The labelmap itself stays hidden** (`renderFill: false`,
  `renderOutline: false`). The segment colour exists purely to feed the
  scissors' drag rectangle; nothing else reads it.

Note the untouched-by-slider list grows by one here: the drag rectangle is
Cornerstone's, so the opacity slider does not fade it either — consistent with
it being edit feedback (an outline) rather than a surface.

---

## 5. Per-exam memory

Both values are remembered **per exam**, not per session
([maskViewPrefs.js](../src/lib/maskViewPrefs.js)) — a tab-lifetime
`Map<String(iec), {opacity, visible}>`:

```js
rememberMaskView(iec, view)
getMaskView(iec, fallback)
```

The right appearance is a property of the exam, not of the session: a faint box
to check the selection against the anatomy underneath it, a solid one to confirm
what is about to be removed. Which of those you want depends on the exam in
front of you.

Three rules:

- An exam the curator **has** adjusted reopens at its own remembered value.
- An exam **never** adjusted opens at `DEFAULT_MASK_VIEW`
  ([MaskIEC.jsx:113](../src/features/mask/MaskIEC.jsx#L113)) — `{opacity: 0.5,
  visible: true}` — explicitly *not* whatever the previous exam was set to. Every
  new exam starts from the same known state.
- Unlike a mask draft, this is display state rather than work, so it is **not**
  dropped on submit or skip. Coming back to a finished exam should still look the
  way it was left.

### 5.1 The ordering hazard

Restore and save are two separate effects
([MaskIEC.jsx:945](../src/features/mask/MaskIEC.jsx#L945) and
[:964](../src/features/mask/MaskIEC.jsx#L964)), and both run in the same commit
when `iec` changes. A dispatch does not apply until the next render, so at that
moment Redux still holds the **previous** exam's value. A naive save would file
that value under the new exam id and clobber the real one.

The save effect therefore gates on `maskViewSyncedRef`:

```js
const applied = maskViewAppliedRef.current;
if (!iec || applied?.iec !== String(iec)) return;     // restore hasn't run for this exam yet
if (!maskViewSyncedRef.current) {
  if (maskOpacity === applied.opacity && maskVisible === applied.visible) {
    maskViewSyncedRef.current = true;                 // Redux has caught up — from here on it's the curator
  }
  return;
}
rememberMaskView(iec, { opacity: maskOpacity, visible: maskVisible });
```

It does nothing until it observes Redux matching what the restore recorded in
`maskViewAppliedRef`, and only treats changes after that as the curator's. The
`applied?.iec !== String(iec)` guard covers the other direction: a save must
never run for an exam the restore hasn't run for yet.

The restore uses an explicit `DEFAULT_MASK_VIEW` fallback rather than reading
whatever is currently in Redux. `resetOptions()` normally lands the same value on
a queue navigation, but it does not run for browser back/forward — and the whole
point of the default is that it is the same every time.

---

## 6. Failure modes this code is shaped around

| # | Symptom | Root cause | Invariant now enforced |
|---|---|---|---|
| 1 | Slider unusable — two full rebuilds per step, box visibly flickering | `maskOpacity` was a dep of the lifecycle effect, so every step tore down and re-added actors and listeners | Opacity read via `maskOpacityRef`; applied by the style-only effect |
| 2 | Slider top end was still barely-there glass | Straight `fillAlpha × opacity` caps at `fillAlpha` = 0.15 | Quadratic ramp to `MAX_FILL_ALPHA` (0.97) |
| 3 | Box high on the slider still didn't block the region under the CT default preset | MIP colours one sample per ray, so the panes get one shot | Interior fill above `CORE_FILL_START`, at `MAX_CORE_ALPHA` = 0.9 |
| 4 | A hidden box reappeared after a slider move | `setMaskBoxStyle` re-applies the fill from `FILL_BOXES`, which still held the coords | `removeMaskBox` deletes the entry; `disableFill` never creates the mapper |
| 5 | Every exam's remembered opacity got overwritten with the default | `resetOptions()` snapped opacity back while the old exam was still rendered; the saver read that as a curator edit | `maskOpacity`/`maskVisible` in `PRESERVED_ON_RESET` |
| 6 | New exam's remembered value clobbered by the previous exam's | Restore and save run in the same commit; a dispatch isn't visible until the next render | `maskViewAppliedRef` + `maskViewSyncedRef` gate the save |
| 7 | Box flashed at the default opacity for one frame on every exam change | Same `resetOptions()` path, before the exam's own value landed | As #5 |
| 8 | Opacity and hide/show didn't affect the 3D fill at all | vtk only rebuilds colour tables when *component 0*'s transfer functions change; the old fill lived on component 1 | Moot under the uniform-driven fill, but relevant if you touch vtk transfer functions |
| 9 | Resize cursors and working drag handles over a box too faint to see | One element opacity faded border, fill and handles together, and a CSS `opacity: 0` element still takes pointer events | Opacity fades the fill background only; border and handles never dim, so every slider value is findable and `min` is back to 0 |
| 10 | A selection could be grown while hidden, then submitted unseen | Hiding removes the overlays but leaves the scissors armed, and a stroke merges into existing bounds | `MASK_DRAW_START_EVENT` at mouse-down un-hides before any stroke pixel lands; `handleLiveDraw` backstops it |
| 11 | Box edges read as chunky green prisms, not a drawn outline | The shader's edge band reused `SHELL_THICKNESS`, so each edge was as wide as the glass is deep | Separate `EDGE_THICKNESS`, clamped to never exceed the shell |
| 12 | Drawing a stroke previewed in the default palette colour, not the selection green | The scissors draw their drag rectangle in the segment colour, captured at mouse-down; the volume panes never set it (the stack pane did) | Both viewports set segments 1–2 to the selection green, after the representation exists (§4.4) |

---

## 7. The submitted mask's box

The second box: the geometry this exam was **already masked with**, drawn in
amber so it reads as a reference rather than as the thing being edited. Shown by
default at 20% — "what was masked here before?" is context you want before
drawing, not after — but faint, so it sits behind the work instead of competing
with it. On an exam that has never been masked there is nothing to draw, so the
pane looks exactly as it did before.

The whole mechanism lives in one hook,
[`usePreviousMaskOverlay`](../src/features/mask/usePreviousMaskOverlay.js),
mounted by **three routes**:

- the **mask route** — the box beside the live selection;
- the **mask review route** — the reviewer is looking at the already-masked
  images, and the box shows where the mask that produced them sits;
- the **DICOM review route** — its IECs carry masking records too (the
  reviewer's flag action feeds the masking queue), so the overlay and the
  masking rows in the details panel show what any existing mask already
  covers. The masking fetch is `.catch(() => null)`-guarded there: it is
  auxiliary to the route, so a masking-endpoint failure must not take down
  the review itself. An IEC with no masking record gets `{"history":[]}` from
  the API — no parameters, so no rows, no box, control reading `none`.

The **NIfTI review route** is the deliberate exception: its API is file-based
(`/papi/v1/nifti/{file_id}`) with no IEC and no masking fields, so there is
nothing to overlay. It reuses `setVisualReviewConfig` (which enables the
control for DICOM review) and its own `setNiftiConfig` switches the control
back off.

The panel control is gated by its own config entry, `prevMaskToolGroup` —
separate from `maskToolGroup` because the review routes have no selection box
to control. The review routes don't preload their stack images, so the hook
re-resolves the geometry on `IMAGE_LOADED` until the first frame is cached.

**Where the geometry comes from.** The API returns `masking_parameters` on
`getMaskingDetails(iec)` — the same blob the details panel formats — as a box
centre (`LR/PA/IS`) and extent in millimetres. **Several coordinate conventions
coexist in that field**, and `maskingParametersToBounds`
([maskingParameters.js](../src/lib/maskingParameters.js)) tries them in order
until one lands on the volume:

1. **Origin-relative `index × spacing`** — what this app's `submitFinalCoords`
   writes (it applies neither origin nor direction; its "LR" is really "the i
   axis in mm"). Inverted by dividing by the **currently loaded** volume's
   spacing, which is also the trick for decimation: a decimated volume has
   proportionally larger spacing, so the same millimetre offset lands on the
   equivalent slice of whatever is loaded now. Tried first so masks submitted
   here round-trip exactly.
2. **Patient-axis mm from the volume's bounding-box corner** — what POSDA's
   auto-created masks (status `created`) carry. Verified against real exams by
   reading the DICOM headers: e.g. a whole-body sagittal CT spanning patient
   z 37→1671mm stores its defacing cylinder as `IS: 1504` — 1504mm above the
   volume's *corner*, squarely on the face — and values like that can never be
   `index × spacing` for the loaded extent, which is what makes the fallback
   safe. The world box's 8 corners go through the loaded geometry's full
   world→index transform (`volume.imageData.worldToIndex`, with the corner
   from `getBounds()`; for stacks, both built from `imagePlaneModule`), which
   applies origin *and* direction — so sagittal/coronal volumes permute the
   axes correctly. For a **one-image stack** the through-plane axis is exempt
   from the on-volume test: the pipeline stores a 3D box even for a 2D image
   and masks it in-plane, so that axis must not veto the overlay.
3. **Raw scanner-world coordinates**, as a last resort. No observed exam needs
   it; it catches a backend that stores DICOM positions verbatim.
4. **Raw pixel indices** — POSDA's convention for projection radiographs
   (DX/CR). Verified against a real exam: a 2846×2330px chest DX (Imager
   Pixel Spacing 0.148mm, so ~421mm across) stores its blackout box as
   `LR: 2016, PA: 479, width: 606` — positions that only fit as pixels.
   Projection images carry no `ImagePositionPatient`/`Orientation`, so this
   reading is gated to geometry with **no world transform**: exactly where
   readings 2–3 are impossible anyway, and the gate keeps a small pixel box
   from accidentally fitting a volume's index range. Note the details panel
   still labels these sizes "mm" — the blob doesn't say which convention it
   uses, so the panel can't know either.

The residual ambiguity is a mask in one convention whose offsets happen to
also fit an earlier reading: that reading wins and the box lands shifted.
Nothing in the blob says which convention it is; if the backend ever stamps
one, switch on that instead of the fallback chain.

It returns `null` for an exam that has never been masked, an incomplete blob,
or a box that falls entirely off this volume under every reading; `null`
clears `prevMaskAvailable`, which greys the control out and puts `none` in its
readout.

The control itself stays on the panel either way. Curators asked for it to be
in the same place on every exam — a row that disappears leaves you unable to
tell "this exam has no submitted mask" from "this build has no such control",
and the answer to that question is exactly what the row is for.

**Rendering.** Same two halves as the selection box, so the two read as the same
kind of object:

- 3D: its own wireframe actor (`mask-previous-box`) plus a **second slot** in the
  patched volume shader — `maskBoxPrev*` uniforms alongside `maskBox*`, both
  driven through one `maskBoxBlendShell()` GLSL function. The previous box is
  blended first, so where the two overlap the live selection is on top.
- 2D: `addPreviousMaskBox2D` ([viewportFrame.js](../src/lib/viewportFrame.js)) —
  a static, click-through div, dashed and stacked under the selection box. It
  has none of the drag machinery: this box is never editable.

**Wiring.** Three effects in MaskIEC, deliberately separate from the selection's:
one resolves the bounds once the load finishes, one draws/tears down on
`prevMaskVisible`, one restyles in place on the slider. Toggling the reference
box must not tear down the selection's listeners or an in-flight drag, and
vice versa. It is redrawn on `VolumeReallyLoaded` / `StackSegmentationReady`
because the 3D volume actor is attached asynchronously — without that, an exam
that *opens* with the box on can draw its wireframe before there is a volume to
blend glass into.

**During a drag**, the selection's preview coarsens the ray-march for the whole
viewport, so the previous box's shell is rescaled with it
(`applyStoredPrevFill`) — otherwise the coarse march steps clean over a 2-voxel
shell and the reference box vanishes for the length of every drag.

---

## 8. Constants

| Constant | File | Value | Effect |
|---|---|---|---|
| `maskOpacity` / `maskVisible` initial | optionSlice.js | `0.5` / `true` | Half opacity: reads as a region, anatomy still legible underneath |
| `maskToolGroup.step` | presentationSlice.js | 0.05 | 20 stops across the slider |
| `maskToolGroup.defaultValue` | presentationSlice.js | 0.5 | Panel-side mirror of the same default — keep in step with the other two |
| `maskToolGroup.min` | presentationSlice.js | 0 | Safe because only surfaces fade: 0 is an outline-only box, not an invisible one |
| `box2d.fillAlpha` | MaskIEC.jsx | 0.18 | 2D fill base alpha at slider 100%, matching the stylesheet's default background |
| `DEFAULT_STYLE.width` | maskBox.js | 1 | Wireframe edge width, in px. A hairline: the shader draws its own edge band underneath |
| `EDGE_THICKNESS` | maskBox.js | 0.75 | Width of the shader's bright edge band, in voxels. Keep below `SHELL_THICKNESS` |
| `DEFAULT_MASK_VIEW` | MaskIEC.jsx | `{opacity: 0.5, visible: true, prevOpacity: 0.2, prevVisible: false}` | How an unadjusted exam opens; mirror of the defaults below |
| `prevMaskOpacity` / `prevMaskVisible` initial | optionSlice.js | `0.2` / `true` | The submitted mask is shown by default but faint — context behind the work (§7). Mirror of `DEFAULT_MASK_VIEW`'s `prev*` pair |
| `PREVIOUS_EDGE_COLOR` | maskBox.js | `[0.984, 0.749, 0.141]` | The submitted mask's amber — far from the selection green, since the two boxes often overlap. Mirrored by `.viewport-prev-mask-box` in VolumeViewport.css |
| `DEFAULT_STYLE.fillAlpha` | maskBox.js | 0.15 | Base per-sample pane alpha, the low end of the ramp |
| `MAX_FILL_ALPHA` | maskBox.js | 0.97 | Per-sample pane alpha at 100%. Just under 1 so a grazing ray still darkens |
| `MAX_CORE_ALPHA` | maskBox.js | 0.9 | Per-sample interior alpha at 100%; what blocks the region under MIP |
| `CORE_FILL_START` | maskBox.js | 0.7 | Slider point where the hollow shell starts filling |
| `.viewport-mask-box` border / background | VolumeViewport.css | α 0.95 / α 0.18 | The 2D overlay's stylesheet defaults; JS overrides the background per slider, the border never fades |
| Mask segment colour | VolumeViewport.jsx / StackViewport.jsx | `[74, 222, 128, 255]` | `SELECTION_EDGE_COLOR` in 0–255; feeds the scissors' drag rectangle (§4.4) — keep the two in sync |

---

## 9. If you change this

- **Adding a third appearance control** (colour, edge width, …): decide first
  which path it takes. Anything that only changes paint goes through the
  style-only effect and a ref; anything that changes *what exists* goes in the
  lifecycle effect's deps. Getting that backwards is failure mode #1 or a stale
  box.
- **Persisting the preference beyond the tab**: `maskViewPrefs` is a plain `Map`
  by design (it mirrors `lib/maskDrafts`). Moving it to storage means deciding
  what happens to the per-exam entries of exams that no longer exist.
- **Making hide cheaper still**: it already removes everything. If a hidden box
  still costs, the cost is not here.
- **Retuning the fill curves**: change `fillAlphaForOpacity` /
  `coreAlphaForOpacity`, not the call sites — both are read by `applyFill`, which
  serves the initial draw, every restyle, and every drag preview tick, so a
  single edit covers all three paths.

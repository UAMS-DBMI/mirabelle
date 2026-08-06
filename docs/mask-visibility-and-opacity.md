# Mask Show/Hide and Opacity — Implementation Notes

The two Mask controls in the tools panel: an eye toggle that shows or hides the
green selection box, and a slider that sets how strongly it is drawn. They
change **appearance only** — the selection bounds live in the labelmap and are
never touched, so accepting an exam with the box hidden submits exactly what was
drawn.

**Audience:** developers working on the mask route. Companion to
[masking-improvements.md](masking-improvements.md), which covers
how the box itself is drawn; this document covers how these two controls reach
it.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx) | The control surface: eye button + slider |
| [src/features/presentationSlice.js](../src/features/presentationSlice.js) | `maskToolGroup` — range, step, which routes show the control |
| [src/features/optionSlice.js](../src/features/optionSlice.js) | `maskOpacity` / `maskVisible` state, and their exemption from `resetOptions` |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Consumes both: teardown-on-hide, style-only opacity effect, per-exam restore/save |
| [src/lib/maskBox.js](../src/lib/maskBox.js) | 3D: opacity → wireframe paint + two shader alphas |
| [src/lib/viewportFrame.js](../src/lib/viewportFrame.js) | 2D: opacity → element `opacity` on the overlay div |
| [src/lib/maskViewPrefs.js](../src/lib/maskViewPrefs.js) | Per-exam memory of both values |

---

## 1. The control surface

[ToolsPanel.jsx:301–336](../src/features/tools/ToolsPanel.jsx#L301-L336) renders
one row: an eye button and a range input, with a readout that shows either the
percentage or the word `hidden`.

```jsx
Mask: {maskVisible ? `${Math.round(maskOpacity * 100)}%` : "hidden"}
```

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
route flips it on ([presentationSlice.js:241](../src/features/presentationSlice.js#L241)) —
it is the only route that draws a selection box, so it is the only one that gets
the controls. Note that this is a *different* control from the existing
`opacityToolGroup`, which drives the 3D volume's scalar opacity (the anatomy);
these two sit next to each other in the panel and are easy to confuse in code.

---

## 2. State

```js
// optionSlice.js:19
maskOpacity: 1,     // 0–1
maskVisible: true,
```

Defaults of `1` / `true` reproduce the box's appearance from before these
controls existed, so nothing changed for a curator who never touches them.

Both are in `PRESERVED_ON_RESET`
([optionSlice.js:38](../src/features/optionSlice.js#L38)), so navigation's
`resetOptions()` leaves them alone. That exemption is not cosmetic. The mask
route resets options and *then* navigates, so if the new exam id arrives even one
render later there is a render still showing the **old** exam with opacity
already snapped back to 1. The per-exam saver (§5) cannot distinguish that from
the curator moving the slider, and would record 100% over the value that exam
actually had. Restoring is the restore effect's job alone; `resetOptions` must
stay out of it.

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
([MaskIEC.jsx:850](../src/features/mask/MaskIEC.jsx#L850)):

```js
deps: [iec, segmentationId, volumeId, volumetric, leftClickTool, maskVisible]
```

Inside `refreshSelectionBoxes`, hiding takes the same branch as having nothing
selected ([MaskIEC.jsx:776](../src/features/mask/MaskIEC.jsx#L776)):

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
  ([maskBox.js:417](../src/lib/maskBox.js#L417)). `setMaskBoxStyle` re-applies the
  fill from that map, so without the delete a later restyle would resurrect the
  fill of a box the curator had hidden. `disableFill` also never *creates* the
  mapper — removal must not convert a viewport that was never filled.
- **The drag preview bails while hidden**
  ([MaskIEC.jsx:596](../src/features/mask/MaskIEC.jsx#L596)). `drawPreviewBoxes`
  returns early on `!maskVisible`; the overlays it would drive are already gone.

### 3.2 Opacity does not

`maskOpacity` is deliberately **not** a dep of that effect. It reaches the effect
body through a ref instead:

```js
// MaskIEC.jsx:206
const maskOpacityRef = useRef(maskOpacity);
maskOpacityRef.current = maskOpacity;

// MaskIEC.jsx:541 — read at draw time, not captured
const box3dStyle = () => ({ ...SELECTION_BOX_STYLE.box3d, opacity: maskOpacityRef.current });
```

Routing the slider through the lifecycle effect made the control unusable: every
step ran the teardown (remove actors, drop listeners, cancel the rAF) and the
rebuild, which is **two full volume re-renders per slider step**, on a control
that emits a step every few pixels of drag. The slider changes six uniforms and
one CSS property; it must not cost an actor rebuild.

The style-only effect ([MaskIEC.jsx:858–878](../src/features/mask/MaskIEC.jsx#L858-L878))
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

The one 0–1 slider value drives three different things. None of them is a simple
multiply, and the 2D and 3D curves are not the same.

### 4.1 The 2D overlays — one element opacity

`__maskBox2dSetOpacity(value)`
([viewportFrame.js:372](../src/lib/viewportFrame.js#L372)) writes
`frame.style.opacity` directly. `applyStyle`
([viewportFrame.js:333](../src/lib/viewportFrame.js#L333)) does the same on the
re-entry path.

The overlay's own colours are fixed — a 2px border at α 0.95 and a
`rgba(74, 222, 128, 0.18)` background
([VolumeViewport.css:32](../src/components/VolumeViewport.css#L32)). Element
opacity scales **both together**, which is the point: scaling only the border
would fade the outline while leaving a tinted middle, and the box would stop
reading as one object.

So in 2D the response is linear, and slider 100% is the overlay's designed
appearance — a translucent green rectangle you can still see the anatomy
through. The 2D pane is where the curator checks the selection edge against the
image, so it never becomes opaque.

### 4.2 The 3D wireframe — actor opacity

`property.setOpacity(opacity)` on the wireframe actor
([maskBox.js:389](../src/lib/maskBox.js#L389)). Also linear. The 12 edges fade
with the slider so the outline doesn't stay solid around a faded fill.

### 4.3 The 3D fill — two non-linear alphas

The glass panes and the box interior are per-sample alphas in the patched volume
shader, and each has its own curve.

**Panes** — `fillAlphaForOpacity`
([maskBox.js:217](../src/lib/maskBox.js#L217)):

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
([maskBox.js:225](../src/lib/maskBox.js#L225)):

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
| 0% | 0 | 0 | 0 | invisible |
| 25% | 0.089 | 0.31 | 0 | hollow glass |
| 50% | 0.280 | 0.73 | 0 | hollow glass |
| 70% | 0.507 | 0.94 | 0 | hollow glass |
| 85% | 0.720 | 0.99 | 0.45 | filling in |
| 100% | 0.970 | 1.00 | 0.90 | solid block |

The design intent for the 3D pane: at the top of the slider the box stops being
a preview of *where* the mask sits and becomes a preview of *what the mask
does*.

**The asymmetry is worth knowing about.** At 100% the 3D box is essentially
opaque while the 2D boxes are still translucent, because 2D scales a fixed-alpha
overlay linearly and 3D ramps to a near-opaque block. If you ever want the 2D
overlay to follow the same curve, note that its fill alpha is hard-coded in CSS,
not passed through `SELECTION_BOX_STYLE.box2d` — only `borderColor` is. That
would need a `backgroundColor` in the style object and a matching write in
`applyStyle`.

**Slider 0 ≠ hidden.** At 0 the alphas are zero and the element opacity is 0, so
nothing shows — but every actor, listener, and overlay div is still live and
still costing per frame. Only the eye toggle removes them. That is the reason to
keep both controls rather than treating hide as "slider to zero".

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
  ([MaskIEC.jsx:98](../src/features/mask/MaskIEC.jsx#L98)) — `{opacity: 1,
  visible: true}` — explicitly *not* whatever the previous exam was set to. Every
  new exam starts from the same known state.
- Unlike a mask draft, this is display state rather than work, so it is **not**
  dropped on submit or skip. Coming back to a finished exam should still look the
  way it was left.

### 5.1 The ordering hazard

Restore and save are two separate effects
([MaskIEC.jsx:887](../src/features/mask/MaskIEC.jsx#L887) and
[:906](../src/features/mask/MaskIEC.jsx#L906)), and both run in the same commit
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
| 5 | Every exam's remembered opacity got overwritten with 100% | `resetOptions()` snapped opacity back while the old exam was still rendered; the saver read that as a curator edit | `maskOpacity`/`maskVisible` in `PRESERVED_ON_RESET` |
| 6 | New exam's remembered value clobbered by the previous exam's | Restore and save run in the same commit; a dispatch isn't visible until the next render | `maskViewAppliedRef` + `maskViewSyncedRef` gate the save |
| 7 | Box flashed at full opacity for one frame on every exam change | Same `resetOptions()` path, before the exam's own value landed | As #5 |
| 8 | Opacity and hide/show didn't affect the 3D fill at all | vtk only rebuilds colour tables when *component 0*'s transfer functions change; the old fill lived on component 1 | Moot under the uniform-driven fill, but relevant if you touch vtk transfer functions |

---

## 7. Constants

| Constant | File | Value | Effect |
|---|---|---|---|
| `maskOpacity` / `maskVisible` initial | optionSlice.js | `1` / `true` | The pre-controls appearance, so nothing changed for curators who ignore them |
| `maskToolGroup.step` | presentationSlice.js | 0.05 | 20 stops across the slider |
| `DEFAULT_MASK_VIEW` | MaskIEC.jsx | `{opacity: 1, visible: true}` | How an unadjusted exam opens |
| `DEFAULT_STYLE.fillAlpha` | maskBox.js | 0.15 | Base per-sample pane alpha, the low end of the ramp |
| `MAX_FILL_ALPHA` | maskBox.js | 0.97 | Per-sample pane alpha at 100%. Just under 1 so a grazing ray still darkens |
| `MAX_CORE_ALPHA` | maskBox.js | 0.9 | Per-sample interior alpha at 100%; what blocks the region under MIP |
| `CORE_FILL_START` | maskBox.js | 0.7 | Slider point where the hollow shell starts filling |
| `.viewport-mask-box` border / background | VolumeViewport.css | α 0.95 / α 0.18 | The 2D overlay's fixed alphas, scaled as one by element opacity |

---

## 8. If you change this

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

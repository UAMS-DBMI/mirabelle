# General UI — loading UX, header context, error recovery

Component area: the global loading overlay/spinner, first-paint behavior,
disabled-while-loading gating, header exam context, and failed-load
recovery.

Shared wiring, relevant to every task here: the overlay is driven by Redux
`state.options.loading` (`optionSlice.js`, `setLoading`) — not
presentationSlice, not local state — and `LoadingOverlay` is mounted **once,
app-wide**, wrapping the router (`index.js:228`). `LoadingOverlay.jsx` is
the fixed full-screen container; `LoadingSpinner.jsx` is the spinner chip
with a static "Loading..." label.

---

## Task: "The loading indicator is improved"

**Status: implemented** (`b40ad93` mask route; `b136b17` review + nifti
routes).

**Before:** routes rendered *nothing* under the overlay while loading
(`<></>` / `null` / bare `return`), so the spinner floated over a blank
app — and it came down far too early: `setLoading(false)` fired when the
volume *shell* existed, long before pixel data streamed; single-exam routes
never set the flag at all.

**After, two coordinated changes:**

- **Overlay becomes a pure indicator:** `LoadingOverlay.css:14` adds
  `pointer-events: none` — the real UI mounts and streams underneath (this
  is what makes shell-first rendering usable). The spinner is restyled into
  a self-contained translucent chip readable over bright CT slices and dark
  panels.
- **Spinner stays up until images actually load.** The definitive signal is
  `startVolumeLoad(volume, onLoaded)` (utilities.js:697-724, `b136b17`),
  which fires exactly once by combining the `volume.load(cb)` completion
  callback with a fallback listener on Cornerstone's
  `IMAGE_VOLUME_LOADING_COMPLETED` (a volume already mid-stream from a
  previous visit drops the callback but still fires the event). The mask
  route wraps this in app events — `VolumeReallyLoaded`
  (utilities.js:657) / `StackSegmentationReady` (utilities.js:847) — and
  its `clearLoading` listener ignores detail-less events because
  `StackView.jsx:59` fires a bare `VolumeReallyLoaded` on mount. Every
  failure path also clears the flag (initialize catch, stack `.catch`,
  unmount cleanup, and the `VolumeLoadFailed` event fired when segmentation
  prep rejects) so the spinner can't strand.

**Gap:** there is **no progress percentage** anywhere — the chip says
"Loading...". Cornerstone emits `IMAGE_VOLUME_LOADING_PROGRESS` /
`loadStatus.framesProcessed`, currently unused. The most obvious next
improvement in this area.

---

## Task: "UI loading speed was improved"

**Status: implemented** (perceived/first-paint, plus some real latency
wins). Pattern originated in `b40ad93` (MaskIEC), ported to the review
routes in `88121b8`, and to nifti in `b136b17`.

**What used to block first paint:** routes early-returned empty until
`isInitialized`, which flipped only after the whole serial chain
(`getDicomDetails` → `getMaskingDetails` → `getIECInfo` → volume shell) —
header, panels, everything blank behind the spinner.

**What renders immediately now:** the full RouteLayout shell — nav panel +
IEC queue, tools panel, operations bar, right-panel skeleton — and, in the
middle, `ViewportGridPlaceholder` (new in `b40ad93`): a 2×2 grid of black
panes (or a single pane for stacks) with the real viewport's frame styling
and a slow border shimmer (disabled under `prefers-reduced-motion`), so
real viewports slot in without layout jump. Redux/tool config
(`setVolumeConfig`/`setStackConfig`, title, click defaults) is dispatched
as soon as the exam type is known, before the slow load, so the panels are
fully populated behind the spinner. The details panel is gated to `null`
until details resolve so the *previous* exam's details never show across
navigation (the shell now stays mounted).

**Real latency wins in the segment:**

- MaskIEC's three detail fetches parallelized into one `Promise.all`
  (`b40ad93`). Note: DicomReviewIEC/MaskReviewIEC **still await serially**
  — an easy remaining win.
- Stacks no longer block on full download — `loadStackSegmentation` is
  fire-and-forget; the viewport pulls frames on demand.
- `dccd81a` fixed the dev-proxy wedging (dev-only; see cache.md).

**Plausible further speedups:** no code-splitting exists anywhere
(`React.lazy`/dynamic `import()` absent) — route-level splitting and
separating the heavy Cornerstone vendor chunk would cut initial
parse/eval; parallelize the review routes' detail fetches; idle-prefetch
the next IEC's frame list; real progress feedback (above) for perceived
speed. The unmerged concurrency tuning `8d01850` (cache.md) is also a
direct load-speed lever.

---

## Task: "Some UI elements are disabled while an IEC is being loaded"

**Status: implemented — three layers.**

- **`d2fb2b0` — don't mount ToolsPanel before tool groups exist.**
  Shell-first rendering exposed a mount-order bug: the always-mounted shell
  rendered `<ToolsPanel/>` while `toolGroup`/`toolGroup3d` were still
  null/undefined (created in a later effect) → crash in
  MaskReviewIEC/NiftiReviewFile. Fix: gate the mount
  (`{toolGroup && toolGroup3d && <ToolsPanel/>}`) in both;
  DicomReviewIEC/MaskIEC already had it. MaskIEC additionally keys the
  panel on `iec` so its listeners re-bind to fresh tool groups per exam.
- **`3f028d7` — selection tool while loading** (detailed in
  mask-selection.md): Selection button disabled until
  `AllowSegmentationDrawing`; left-click kept fully inert instead of
  falling back to window-level.
- **`d585e74` — navigation gating.** All four VR wrappers bail
  `if (loading)` in `handleNext/Previous/SelectIec` — one guard covers
  hotkeys, buttons, queue clicks, and auto-advance. NavigationPanel greys
  the arrows; queue rows disable (non-active only).

**Not gated (flag for discussion):** the **operations bar** — accept /
reject / skip / clear / not-maskable are clickable while an exam is still
loading, so a curator can commit a terminal action against a half-loaded
exam. Review-route status buttons and DICOM-type dropdowns are likewise
ungated. (Window-level/zoom/pan over the placeholder are harmless.) This
overlaps with the duplicate-status-POST risk in iec-navigation.md — one
in-flight/loading guard on operations would close both.

---

## Task: "The image type and its ID are now shown in the header"

**Status: implemented, in the header proper** (`d585e74`, the "header
context" clause). Two additions in `Header.jsx`:

1. **Viewer-type glyph in the title.** `TitleContent` (Header.jsx:121-136)
   regex-replaces the word "Volume"/"Stack" in the Redux title with the
   MaterialIcon `deployed_code` (Volume/3D) or `layers` (Stack/2D) — the
   same glyphs the queue rows use. Titles without either word render
   unchanged.
2. **Detail line beside the title.** New Redux field `titleDetail`
   (`optionSlice.js`) rendered at Header.jsx:140 (`text-sm opacity-70
   truncate`). Each exam route sets it as
   `[iec, modality, series_description].filter(Boolean).join(" · ")` — e.g.
   `1117932 · CT · AXIAL LUNG` — and clears it to null at load start. So
   the ID is the IEC id, and "type" appears twice: volume/stack glyph +
   DICOM modality.

**Gap:** `NiftiReviewFile` never sets `titleDetail` (file-based route, only
sets the title) — the nifti header shows no detail line. Decide whether to
show the file name there.

---

## Task: "A reload-image button was added for failed loads"

**Status: implemented — but earlier than assumed and Mask-route-only.** The
whole affordance (`handleReload`, `reloadToken`, both buttons) originates
in `e5e9bfd` (masking-improvements), not the ui-loading segment, and exists
only in `MaskIEC`.

**Mechanism:** `handleReload` (MaskIEC.jsx:540-547) decaches the exam
(`decacheVolume` / `removeCachedImages`) and bumps `reloadToken`, which is
in the load effect's deps → full re-initialize. Failed downloads are never
cached, so the retry genuinely re-fetches missing slices. Two entry
points: a "Reload Image" button in `DetailsPanel` (DetailsPanel.jsx:89-98,
rendered whenever `onReload` is passed — only MaskIEC passes it,
MaskIEC.jsx:1202), and, in the hard-error state, `ViewportPlaceholder`
with a reload action (MaskIEC.jsx:1092-1093, ViewportPlaceholder.jsx:31-40).

**How failures surface today:** initialize catch → toast
(`messages.errors.loadImage`) + `setIsErrored(true)`; deep XHR failures →
global handler → deduped `messages.errors.framesFailed` toast — whose copy
is *"Some images failed to download. Use "Reload Image" to retry."* — **but
the review/nifti routes don't have that button**, so the toast points at a
control the user doesn't have there. Their errored state is a bare
`ViewportPlaceholder` with no action (MaskReviewIEC.jsx:462,
NiftiReviewFile.jsx:336, DicomReviewIEC.jsx:550). `ErrorState.jsx`'s "Try
again" is for the router-level ErrorBoundary only, explicitly not wired to
image failures.

**Plan:** extend to the review routes — low friction: they already have
`isErrored` and `ViewportPlaceholder`; copy MaskIEC's
`reloadToken`/`handleReload` (the decache utilities are generic). That
also makes the `framesFailed` toast truthful everywhere.

## Open questions for discussion

1. Gate the operations bar (and status buttons) on `loading` — and/or an
   in-flight guard per action (see iec-navigation.md)?
2. Progress percentage on the spinner (Cornerstone progress events are
   available and unused)?
3. Code-splitting: worth the webpack work now, or after the feature dust
   settles?
4. Reload button in review/nifti routes — straight port, or a shared
   `useReloadableExam` hook to avoid three copies?
5. Nifti header detail line (file name?) for consistency.

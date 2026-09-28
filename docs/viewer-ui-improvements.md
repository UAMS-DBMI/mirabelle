# Viewer UI Improvements — Implementation Notes

Eight commits (`3801272`..`ba13aca`) that make the viewer legible while it
works: you can see which pane is active and what it shows, scrub and expand it
from the pane itself, read what exam you are on from the header, and — the
largest change — use the app while its images are still downloading instead of
staring at a spinner over an empty screen.

**Audience:** developers touching the viewport panes, the header, or any route's
load path.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/RouteLayout.css](../src/components/RouteLayout.css) | The `.viewport` hover / active outline, drawn as a pseudo-element |
| [src/components/ViewportLabel.jsx](../src/components/ViewportLabel.jsx) | Corner badge naming a pane's view |
| [src/components/ViewportExpandButton.jsx](../src/components/ViewportExpandButton.jsx) | Corner button for the expand / restore toggle |
| [src/lib/viewportView.js](../src/lib/viewportView.js) | `toggleViewportExpanded` — the one expand implementation |
| [src/lib/sliceScrollbar.js](../src/lib/sliceScrollbar.js) | Slice-position indicator and scrub handle for a 2D pane |
| [src/components/VolumeViewport.css](../src/components/VolumeViewport.css) | Scrollbar track / thumb / label styling and its z-order |
| [src/components/Header.jsx](../src/components/Header.jsx) | Viewer-type glyph in the title, plus the exam detail line |
| [src/components/ViewportGridPlaceholder.jsx](../src/components/ViewportGridPlaceholder.jsx) | Empty pane grid shown while images load |
| [src/components/LoadingOverlay.css](../src/components/LoadingOverlay.css) | Makes the overlay click-through |
| The four exam routes | Shell-first rendering and spinner ownership (see §6) |

---

## 1. Which pane am I in

Every pane already responded to clicks; nothing said which one had them. Each
viewport now dispatches `setOption({key: "viewport", value: viewportId})` on
`onMouseDownCapture` — capture phase, so the Cornerstone tools underneath still
get the event — and renders with an `active` class when that id matches.

The outline is a `.viewport::after` pseudo-element rather than a border on the
element itself: a real border would resize the Cornerstone canvas on every
selection change, and any element in the pane's own flow would sit in front of
the tools. The pseudo-element is `pointer-events: none`, inset over the existing
rounded corners, and transitions colour only — dim blue on hover of any pane,
bright blue on the active one.

`viewport` is set through the generic `setOption` reducer and is deliberately
absent from `optionSlice`'s `initialState`, so it clears on `resetOptions` —
navigating to a new exam starts with no pane marked active until the curator
clicks one.

## 2. Viewport labels

[ViewportLabel.jsx](../src/components/ViewportLabel.jsx) is a corner badge
reading Axial / Coronal / Sagittal / 3D / Stack. `VolumeViewport` maps its
`orientation` prop through `PANE_LABELS` and falls back to the raw prop for an
orientation the map doesn't cover; the 3D and stack viewports pass a fixed
string.

It is rendered as a React child of the Cornerstone host element. That is safe
because Cornerstone only ever appends its own `div.viewport-element` there and
leaves sibling children alone — the same assumption the data-frame and mask-box
overlays already make. The badge is `pointer-events: none` at `z-index: 13`, so
it sits above the canvas and those overlays without blocking tools or the
double-click gesture underneath it.

## 3. Expand, from the pane

Double-click already toggled a pane to fill the grid; nothing advertised it.
[ViewportExpandButton.jsx](../src/components/ViewportExpandButton.jsx) is the
same toggle made visible — a corner button that fades in on pane hover and
swaps between `open_in_full` and `close_fullscreen`.

Both viewport components had their own copy of the toggle, so the button meant a
third. They now share `toggleViewportExpanded` in
[viewportView.js](../src/lib/viewportView.js), which minimises the siblings,
flips the `expanded` classes, forces the render-engine resize, **and returns the
wrapper's resulting state** — that return is what keeps the button's icon in
sync with DOM it mutated imperatively. The volume viewport also calls
`setExpanded(false)` where its setup clears those classes, for the same reason.

The button stops propagation on `mousedown` (capture), `click`, and `dblclick`.
Without that, pressing it would also mark the pane active and hand the tools a
drag, and its own second click would reach the pane's double-click handler and
immediately undo the toggle.

Two stacking details, both deliberate: the button is `z-index: 16` so it stays
above the slice scrollbar strip (`z-index: 15`) that overlaps its rightmost few
pixels, and it is not rendered on the stack viewport, which already fills its
route alone.

## 4. The slice scrollbar

[sliceScrollbar.js](../src/lib/sliceScrollbar.js) attaches a thin track down the
right edge of a 2D pane: a thumb whose position shows how far through the stack
the current slice is, a `n / total` label beside it on hover, and drag-to-scrub.

**It is imperative, not React.** It repositions on Cornerstone's
`IMAGE_RENDERED` — the same signal the box overlays use, and the only one that
covers wheel scrolling, MPR crosshair jumps, and programmatic scrolls alike.
That event fires per rendered frame; routing it through React state would
re-render the pane on every scroll tick. `attachSliceScrollbar` returns a detach
function, held in `scrollbarDetachRef` and called both before re-attaching (a
volume change) and on teardown.

`viewport.getSliceIndex()` is the single source of truth throughout. Scrubbing
converts the pointer's Y to a target index and calls `viewport.scroll(delta)`
rather than positioning the thumb directly, so the next `IMAGE_RENDERED`
re-syncs it and the thumb can never drift from the slice on screen.

Details worth keeping: the thumb is floored at `MIN_THUMB_PX` (18px) so a
600-slice volume still leaves something grabbable, with the top offset scaled by
the remaining travel so it can't overflow the track; grabbing the thumb keeps
the grab offset while clicking bare track centres the thumb on the pointer;
`mousedown` is left-button-only, leaving right and middle to the pan and zoom
tools. `readSlicePosition` returns null — hiding the track — while the volume
isn't ready or has fewer than two slices, since the camera's slice range is
undefined before load.

## 5. The header line

The title now carries what exam you are on. `TitleContent` in
[Header.jsx](../src/components/Header.jsx) rewrites the word "Volume" or
"Stack" in the existing title into the matching glyph (`deployed_code` /
`layers`, with a tooltip); a title containing neither word renders untouched.
`MaterialIcon` grew `className` and `title` props to allow it.

Beside it sits `titleDetail`, a new `optionSlice` field holding a compact
`IEC · modality · series description` line that each exam route sets when its
details land and clears at the start of the next load. The title span is
`flex-none` and the detail truncates, so a long series description shortens
itself rather than pushing the title off-screen.

## 6. Showing the UI while images load

The routes used to return `null` until the exam was fully loaded, so a slow exam
was a spinner on a blank page. The layout shell now renders immediately and the
UI fills in as the data arrives. Four changes make that work:

**The overlay is an indicator, not a modal.** `#overlay` is
`pointer-events: none` — there is a live UI beneath it now — and the spinner
moved onto its own translucent dark chip with white-on-dark text, because it
must stay readable over both a bright CT slice and a dark panel in either theme
rather than over an empty background.

**The panes exist before the images do.**
[ViewportGridPlaceholder.jsx](../src/components/ViewportGridPlaceholder.jsx)
renders 2×2 empty panes (or one, for a stack) matching the real viewports' black
canvas and rounded frame, with a slow border shimmer that honours
`prefers-reduced-motion`. `volumetric` defaults to true, so a volume shows four
panes from the first frame and the real viewports slot in without a layout jump.
It also occupies the middle panel's first grid row, which keeps the operations
bar on its own row instead of stretching to full height.

**The tools panel is configured before the load, not after.** Each route now
dispatches its `reset()` / config / view / click-binding block as soon as it
knows whether the exam is a volume or a stack — before the slow image load
rather than after it — so the tools panel and operations bar are fully populated
behind the spinner instead of half-built.

**Spinner ownership moved to load completion.** With the UI up, `setLoading`
can no longer mean "the route is mounted"; it has to mean "the pixel data has
arrived". Each route raises it at the very start of `initialize` and lowers it
from whichever signal actually ends its load:

- Volume exams: the load-completion callback passed to `loadVolume` /
  `startVolumeLoad`, guarded by the same cancellation and request-id checks as
  the rest of the load path.
- SEG volumes: inline, since `loadVolumeAsync` has already fully loaded them.
- Stacks: inline, because frames stream on demand into a viewer that is already
  mounted.
- [MaskIEC.jsx](../src/features/mask/MaskIEC.jsx): a listener on
  `VolumeReallyLoaded` / `StackSegmentationReady` / `VolumeLoadFailed`. It
  ignores detail-less `VolumeReallyLoaded` events, because `StackView` fires one
  on mount before anything has loaded.
- On error, and in the effect's teardown: cleared explicitly. A failed load
  never completes, and a load abandoned by navigation has a stale callback that
  will never fire — either would otherwise leave the spinner up forever.

Two consequences of the shell outliving the exam. `details` and
`maskingDetails` now start as `null` and are cleared at the top of each load,
with the details panel rendering an empty `side-panel` shell until they arrive;
previously the shell unmounted between exams and stale details could not be
seen. And `ToolsPanel` is gated on `toolGroup && toolGroup3d` existing, since it
calls `toolGroup.addTool` on mount and the shell now renders before the effect
that creates them.

Two fixes fell out of the same change:

- `ToolsPanel` holds its `manager` in a ref that every render refreshes. Its
  `AllowSegmentationDrawing` listener is registered once on mount, and on IEC
  navigation the tool group is destroyed and recreated — a listener closing over
  the mount-time manager kept arming the scissors on the destroyed group, so
  selection silently failed on the new image until the user clicked the
  Selection button.
- `DicomReviewIEC` takes a `noIecs` prop and shows the "no results" message only
  when the filter genuinely returned nothing, instead of on every errored exam.

[MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) also fetches its three
independent lookups (`getDicomDetails`, `getMaskingDetails`, `getIECInfo`)
through one `Promise.all` rather than serially — with the UI visible, the wait
before the first pane appears is now something the user watches.

## 7. Known gaps

- **The scrollbar is 2D-volume only.** `attachSliceScrollbar` is wired in
  `VolumeViewport` alone; the stack viewport, which is exactly where a slice
  indicator is most expected, doesn't have one.
- **Expand state is DOM-owned.** `toggleViewportExpanded` mutates classes and
  each component mirrors the result in local state. Two panes cannot disagree in
  practice, but nothing enforces that — a second expand path would have to keep
  going through this helper.
- **Colours are literals.** The outline, label, scrollbar, and placeholder
  colours are hardcoded rgba values in four CSS files rather than shared tokens,
  and the amber / green already in `VolumeViewport.css` have to be kept in step
  with `lib/maskBox` by hand.
- **Scrubbing has no keyboard or touch path.** `mousedown`/`mousemove` only, and
  the track is not focusable.
- **[src-file-structure.md](src-file-structure.md) is behind** — it lists
  `ViewportLabel` but not `ViewportExpandButton`, `ViewportGridPlaceholder`, or
  `lib/sliceScrollbar.js`.
- **A stray `console.log` remains** in `MaskReviewIEC`'s volume branch.

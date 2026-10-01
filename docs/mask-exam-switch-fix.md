# Mask Exam Switch Fix — Implementation Notes

Curators masking a queue that mixes volumes and stacks hit three symptoms that
only a page refresh cured:

- a mask or segmentation from a previous exam interfering with the current one;
- the selection tool not drawing after navigating back and forth or after
  submitting;
- on the last exam, the submitted mask disappearing and the "Submitted for
  masking" toast vanishing almost instantly.

All three came from state that outlived the exam it belonged to. A refresh
fixed them because it clears Cornerstone's global state and every listener.

**Branch:** `mask-exam-switch-fix` (from `main`)

**Audience:** developers touching the mask route's load path, its viewports, or
its accept / skip / navigation flow.

**Modules:**

| File | Responsibility |
|---|---|
| [src/utilities.js](../src/utilities.js) | `loadVolumeAndSegmentation` ignores a load that finishes after its exam was left; `whenVolumeLoaded` survives a revisit mid-load |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Tracks segmentation readiness and switches on drawing only once the tools panel is mounted; `finishExam` / `refreshMaskingDetails` for the last exam |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) | Removes its event listener on unmount; attaches an already-existing mask segmentation on mount |
| [src/routes/mask/RouteMaskVR.jsx](../src/routes/mask/RouteMaskVR.jsx) | Resets tool options only when actually navigating; passes `hasNext` |
| [src/features/mask/MaskVR.jsx](../src/features/mask/MaskVR.jsx) | Now a thin pass-through (option reset moved to the route) |
| [src/lib/notify.js](../src/lib/notify.js) | `keepPrevious` option: show a toast without dismissing the current one |
| [src/routes/dev/RouteMessagesPlayground.jsx](../src/routes/dev/RouteMessagesPlayground.jsx) | Preview of the last-IEC toast pair |

---

## 1. Background: how an exam becomes drawable

`MaskVR` keeps one `MaskIEC` mounted and only changes its `iec` prop as the
curator moves through the queue. Cornerstone state — the rendering engine
`re1`, the segmentation registry and the global `eventTarget` — is shared
across all exams.

For each exam, the chain is:

1. `MaskIEC` loads the images and creates a mask segmentation
   (`mask-<iec>-seg-<random>`).
2. A `"VolumeReallyLoaded"` event announces it. For a volume it is fired by
   `loadVolumeAndSegmentation` once the volume has fully downloaded. For a stack
   it is fired by `StackView` on mount.
3. `VolumeViewport` hears the event and attaches the segmentation to its pane.
4. `MaskIEC` relays it as `"AllowSegmentationDrawing"`, and `ToolsPanel`
   responds by switching the left-click tool to the selection (scissors) tool.

The last step matters: the mask route's default left-click tool is
**window/level** ([presentationSlice.js:233](../src/features/presentationSlice.js#L233)).
If `AllowSegmentationDrawing` goes unheard, the Selection button still looks
active (it follows the `leftClick` option) but dragging changes window/level.

## 2. A late volume load replaced the current exam's segmentation

`loadVolumeAndSegmentation` doesn't wait for the volume. It registers a
callback with `volume.load()` that runs when the download finishes, and that
callback:

1. calls `removeAllSegmentations()` and `removeAllSegmentationRepresentations()`;
2. creates the volume's mask segmentation;
3. fires `VolumeReallyLoaded`.

Downloading continues after the curator moves on. If they left a volume before
it finished, the callback ran during a later exam: it deleted that exam's
segmentation — a stack's included — and broadcast the old volume's, which the
current panes then attached. Drawing and Accept on the current exam broke.

**Fix.** `loadVolumeAndSegmentation` takes an `isCurrent` option
([utilities.js:410](../src/utilities.js#L410)). `MaskIEC` passes a check that
its load request is still the latest
([MaskIEC.jsx:285](../src/features/mask/MaskIEC.jsx#L285)). A callback for an
exam that is no longer current returns without touching anything
([utilities.js:434](../src/utilities.js#L434)).

### Revisiting a volume that is still loading

`volume.load(callback)` silently drops the callback when the volume is already
part-way through loading
([BaseStreamingImageVolume.js:175](../node_modules/@cornerstonejs/core/dist/esm/cache/classes/BaseStreamingImageVolume.js#L175)).
So when a curator left a volume mid-load and came back, the new visit's
segmentation was never created. `MaskIEC` held its id, but the panes had the
first visit's.

**Fix.** `whenVolumeLoaded` ([utilities.js:386](../src/utilities.js#L386))
calls `volume.load(callback)` as before unless a load is in progress. In that
case it waits for Cornerstone's `IMAGE_VOLUME_LOADING_COMPLETED` event for that
volume instead. The first visit's callback still runs too, but `isCurrent`
discards it.

## 3. Drawing was never switched on for a cached volume

When a volume is already in the cache (navigating back to it),
`volume.load(callback)` runs the callback **synchronously**, during `MaskIEC`'s
initialization. `ToolsPanel` and the volume panes only mount once
`isInitialized` is set, which is later. So:

- `MaskIEC` relayed `AllowSegmentationDrawing` before `ToolsPanel` was listening,
  and the selection tool stayed off;
- `VolumeViewport`'s listener wasn't registered yet either, and on mount it
  deliberately skips `mask-` segmentations, so the panes never got the
  segmentation.

**Fix, in `MaskIEC`.** `VolumeReallyLoaded` now only sets a
`segmentationReady` flag ([MaskIEC.jsx:166](../src/features/mask/MaskIEC.jsx#L166)).
A separate effect fires `AllowSegmentationDrawing` once both `isInitialized` and
`segmentationReady` are true
([MaskIEC.jsx:183](../src/features/mask/MaskIEC.jsx#L183)). `ToolsPanel` is a
child of `MaskIEC`, and React runs a child's effects before its parent's in the
same commit, so its listener is always in place. The flag is reset whenever an
exam starts loading ([MaskIEC.jsx:239](../src/features/mask/MaskIEC.jsx#L239)).
`segmentationId` is also a dependency, so a volume Clear — which swaps in a new
segmentation — re-arms the selection tool as it did before.

**Fix, in `VolumeViewport`.** On mount the pane now also attaches the current
exam's own mask segmentation if it already exists
([VolumeViewport.jsx:163](../src/components/VolumeViewport.jsx#L163)). For an
uncached volume it doesn't exist yet, and the event attaches it later, so it is
never attached twice.

## 4. Volume panes leaked event listeners

Each `VolumeViewport` added a global `VolumeReallyLoaded` listener on mount and
never removed it. Panes are remounted for every exam, so listeners piled up,
and old ones kept attaching later exams' segmentations to whichever viewport
now had their id (`axial2d`, `coronal2d`, `sagittal2d`).

**Fix.** The handler is defined in the effect and removed in its cleanup
([VolumeViewport.jsx:95](../src/components/VolumeViewport.jsx#L95),
[:184](../src/components/VolumeViewport.jsx#L184)). It is registered
synchronously inside `setup()`, before its first `await`, so the cleanup always
finds it.

## 5. The last exam

Three problems, all after a decision (Accept, Skip, Non-Maskable) on the last
exam in the queue.

### Options were reset even though nothing navigated

`MaskVR.handleNext` dispatched `resetOptions()` **before** the route checked
whether a next exam existed. `resetOptions` sets Decimate back to 0 unless
"persistent" is on ([optionSlice.js:33](../src/features/optionSlice.js#L33)),
and `MaskIEC` reloads whenever Decimate changes. On the last exam with Decimate
above 0, Accept therefore reloaded the same exam with a fresh, empty
segmentation, and the mask just submitted disappeared.

**Fix.** The reset moved into `RouteMaskVR` as `resetExamOptions`
([RouteMaskVR.jsx:93](../src/routes/mask/RouteMaskVR.jsx#L93)) and only runs
when there is a next or previous exam to go to. `MaskVR` passes `onNext` /
`onPrevious` straight through.

### The confirmation toast was replaced at once

Success and info toasts share one slot: a new one dismisses the current one
([notify.js:24](../src/lib/notify.js#L24)). Accept showed "Submitted for
masking", then called `onNext`, which found no next exam and showed "No next
IEC available." — instantly replacing the confirmation. Skip and Non-Maskable
behaved the same way.

**Fix.** `RouteMaskVR` passes `hasNext` down to `MaskIEC`
([RouteMaskVR.jsx:129](../src/routes/mask/RouteMaskVR.jsx#L129)). All three
decisions now go through `finishExam`
([MaskIEC.jsx:424](../src/features/mask/MaskIEC.jsx#L424)):

- with a next exam: show the confirmation and call `onNext`, as before;
- on the last exam: don't call `onNext`. Show the confirmation (e.g.
  "Submitted for masking") and then the "No next IEC available." warning as
  **two separate toasts**, both visible for their full duration.

The warning is shown with `notify.info(..., { keepPrevious: true })`. That
option makes `showInSlot` leave the current toast in place instead of
dismissing it, so the two stack rather than one replacing the other. Every
other toast keeps the one-at-a-time slot behaviour.

`handleAccept` no longer shows the toast itself; `finishExam` does.
`hasNext` defaults to `true`, so the single-exam route (`RouteMaskIEC`, whose
`onNext` is a no-op) keeps its plain confirmation.

### The details panel kept the old masking status

`maskingDetails` was only fetched when an exam loaded, so after a decision on
the last exam the "Masking Status" in the details panel stayed stale.

**Fix.** `finishExam` calls `refreshMaskingDetails`
([MaskIEC.jsx:438](../src/features/mask/MaskIEC.jsx#L438)), which refetches the
status. If the curator has already moved on, the next exam's load has started a
new request, and the stale result is dropped rather than overwriting the new
exam's details.

## 6. Not changed

- `StackView` still fires `VolumeReallyLoaded` on mount, slightly before
  `StackViewport` has finished attaching its labelmap. A draw in that brief
  window can still fail once; this was not part of the reported symptoms.
- Viewports are still not disabled when their component unmounts. With the
  fixes above, the leftover viewports no longer receive segmentations from
  other exams.
- Pre-existing lint and Prettier issues in the touched files were left alone.

## 7. Testing

Manual — no automated tests were added. Build and lint were checked: the
production build compiles, and lint reports no new problems (34 vs 36 on
`main`).

Use a queue that mixes volumes and stacks, and **do not refresh the page**
between steps.

**Late volume load**

1. Open a large volume and move to the next exam (a stack) before it finishes
   loading.
2. Wait a few seconds for the volume to finish in the background.
3. Draw and Accept on the stack. Drawing works and the submission succeeds.

**Revisits**

1. Visit a volume, let it load, move on, then come back.
2. The selection tool is active and drawing works without changing tools.
3. Repeat, coming back to a volume while it is still loading. Once it loads,
   drawing works.

**Last exam**

1. Set Decimate above 0 on the last exam of the queue, draw, Expand and Accept.
2. The mask stays on screen, and two toasts show together for their full
   duration: "Submitted for masking" and "No next IEC available.". The details
   panel shows the new masking status.
3. On another last exam, Skip and Non-Maskable show their confirmation and the
   same warning, as two toasts.
4. On any other exam, Accept still advances to the next one with the usual
   confirmation.

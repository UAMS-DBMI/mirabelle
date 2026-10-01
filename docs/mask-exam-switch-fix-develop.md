# Mask Exam Switch Fix (develop line) — Implementation Notes

This ports the mask-route fixes from `main` (PRs #35 and #36) onto
`image-navigation-fix-develop`. That branch already has the newer masking tool:
a single green selection box that can be moved and resized, with no Expand
step. That tool is kept as is. Nothing from `main`'s old red-rectangle tool
was brought over.

Much of what the `main` fixes address was already solved on this branch in
its own way, so only two fixes were needed:

1. Stop the first stack's selection being submitted for every later stack.
2. On the last IEC, keep the submitted mask on screen, show the confirmation
   and the "no next" warning as two separate toasts, and show the new masking
   status.

**Branch:** `mask-exam-switch-fix-develop` (from `image-navigation-fix-develop`)

**Audience:** developers working on the mask route on the develop line, and
anyone comparing it with the `main` fixes in `docs/mask-exam-switch-fix.md`
and `docs/stack-mask-carryover-fix.md` on `main`.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Stack Accept reads the current drawing; `finishExam` / `refreshMaskingDetails` for the last IEC |
| [src/routes/mask/RouteMaskVR.jsx](../src/routes/mask/RouteMaskVR.jsx) | Resets tool options only when actually navigating |
| [src/features/mask/MaskVR.jsx](../src/features/mask/MaskVR.jsx) | Now a thin pass-through (option reset moved to the route) |
| [src/lib/notify.js](../src/lib/notify.js) | `keepPrevious` option: show a toast without dismissing the current one |
| [src/routes/dev/RouteMessagesPlayground.jsx](../src/routes/dev/RouteMessagesPlayground.jsx) | Preview of the last-IEC toast pair |

---

## 1. Stack selection carried over between exams

`MaskVR` keeps one `MaskIEC` mounted and only changes its `iec` prop as the
curator moves through the queue, so `MaskIEC`'s React state lives across exams.

Stack Accept only computed the box when none was cached yet:

```js
if (!coords) {
  finalCoords = getCoordsForStackSeg(imageIds);
  setCoords(finalCoords);
}
```

Nothing reset `coords`, so the first stack's Accept cached its box and every
later stack was submitted with it. Volumes weren't affected: on this branch
their Accept always reads `getLabelmapBounds(segmentationId)`.

**Fix.** Stack Accept always reads the box from the current labelmap
([MaskIEC.jsx:1424](../src/features/mask/MaskIEC.jsx#L1424)). Nothing else read
the cached `coords`, so that state was removed.

## 2. The last IEC

All three problems below happened after a decision (Accept, Skip,
Non-Maskable) on the last IEC in the queue, where there is no next exam.

### Options were reset even though nothing navigated

`MaskVR.handleNext` dispatched `resetOptions()` **before** the route checked
whether a next IEC existed. `resetOptions` sets Decimate back to 0 unless
"persistent" is on, and `MaskIEC`'s load effect reruns whenever Decimate
changes. On the last IEC with Decimate above 0, Accept therefore reloaded the
exam, and the mask just submitted disappeared from the view.

**Fix.** The reset moved into `RouteMaskVR` as `resetExamOptions`
([RouteMaskVR.jsx:111](../src/routes/mask/RouteMaskVR.jsx#L111)). It runs only
when there is a next or previous IEC to go to. `MaskVR` passes `onNext` and
`onPrevious` straight through, including from its hotkeys.

### The confirmation toast was replaced at once

Success and info toasts share one slot: a new one dismisses the current one
([notify.js:31](../src/lib/notify.js#L31)). Accept showed "Submitted for
masking", then called `onNext`, which found no next IEC and showed "No next IEC
available.", instantly replacing the confirmation. Skip and Non-Maskable did
the same.

**Fix.** All three decisions now go through `finishExam`
([MaskIEC.jsx:1291](../src/features/mask/MaskIEC.jsx#L1291)), using the
`hasNext` prop this branch already had:

- with a next IEC: show the confirmation and call `onNext`, as before;
- on the last IEC: don't call `onNext`. Show the confirmation, then the
  warning with `notify.info(..., { keepPrevious: true })`.

`keepPrevious` makes `showInSlot`
([notify.js:50](../src/lib/notify.js#L50)) leave the current toast in place,
so the two toasts stack instead of one replacing the other. Every other toast
still shows one at a time. `handleAccept` no longer shows the toast itself;
`finishExam` does.

### The masking status stayed stale

`maskingDetails` was only fetched when an exam loaded. On this branch it feeds
two things: the "Masking Status" in the details panel, and the amber
submitted-mask overlay (`usePreviousMaskOverlay`,
[MaskIEC.jsx:1158](../src/features/mask/MaskIEC.jsx#L1158)), which recalculates
whenever `maskingDetails` changes.

**Fix.** `finishExam` calls `refreshMaskingDetails`
([MaskIEC.jsx:1306](../src/features/mask/MaskIEC.jsx#L1306)). On the last IEC,
the details panel then shows the new status, and the amber overlay shows the
mask that was just submitted. If the curator has already moved on, the next
exam's load has started a new request, so the late result is dropped rather
than overwriting the new exam's details.

## 3. Already handled on this branch (not ported)

The `main` fixes for the following problems were not needed here. This branch
already solves each of them, in a different way.

| Problem (as fixed on `main`) | How this branch already handles it |
|---|---|
| A volume that finishes loading after its exam was left replaces the current exam's segmentation | `examLoadGeneration` ([utilities.js:556](../src/utilities.js#L556)) is bumped by every volume and stack load, and stale completions are skipped. The segmentation is also created before the volume streams, not in the completion callback. |
| Revisiting a volume mid-load drops its completion callback | `startVolumeLoad` ([utilities.js:762](../src/utilities.js#L762)) fires the callback even when the volume is already loading. |
| Drawing never switched on for a cached volume | `ToolsPanel` mounts with the layout shell, before the image loads, so it hears `AllowSegmentationDrawing`. It reaches the current tool group through `managerRef` ([ToolsPanel.jsx:154](../src/features/tools/ToolsPanel.jsx#L154)), and `MaskIEC` re-activates the segmentation on the 2D panes after load ([MaskIEC.jsx:589](../src/features/mask/MaskIEC.jsx#L589)). |
| `VolumeViewport` leaked a global listener per mount | The listener is tracked in `volumeLoadedListenerRef` and removed on unmount ([VolumeViewport.jsx:347](../src/components/VolumeViewport.jsx#L347)). |
| Several stack rectangles merged into one large box (`main`'s `SingleSelectionRectangleScissorsTool`) | Not ported, because it belongs to the old red tool. Here the selection is a single green box that can be moved and resized. |

## 4. Testing

Manual only; no automated tests were added. The production build compiles, and
lint reports the same problems as before the change.

Use a queue that mixes volumes and stacks, and **don't refresh the page**
between steps.

**Stack carry-over**

1. Accept a stack selection.
2. On the next stack, draw a box in a clearly different place and Accept.
3. The submitted coordinates (logged by `handleAccept`, and in the masking
   request) match the second box.

**Last IEC**

1. On the last IEC, set Decimate above 0, draw a selection and Accept.
2. The exam does not reload. Two toasts show together for their full duration:
   "Submitted for masking" and "No next IEC available.".
3. The details panel shows the new masking status, and the amber overlay shows
   the submitted mask.
4. On another last IEC, Skip and Non-Maskable each show their confirmation plus
   the same warning.
5. On any other IEC, Accept still moves to the next IEC with the usual single
   confirmation.

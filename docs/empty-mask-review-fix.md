# Empty Mask Review Fix — Implementation Notes

Opening an exam in mask review that has nothing to review now shows "No masked
images to review for this exam yet." instead of a crash and a stack of error
toasts.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Show an empty state for mask reviews with no masked
files

**Audience:** developers touching the mask review load path.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/mask-review/MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx) | Stops the load when there are no frames and renders the empty state |
| [src/lib/messages.js](../src/lib/messages.js#L75) | `viewport.noMaskedImages` |

---

## 1. The problem

Mask review loads the masked files from `/papi/v1/masking/{iec}/reviewfiles`.
An exam that was never masked (masking status `created`) has none, so the
endpoint returns no frames. `getIECInfo` also turns any non-OK response into an
empty list ([utilities.js:187](../src/utilities.js#L187)).

MaskReviewIEC went on regardless:

1. `makeRoomForExam([], …)`
   ([MaskReviewIEC.jsx:311](../src/features/mask-review/MaskReviewIEC.jsx#L311))
   calls `getFrameGeometry`
   ([utilities.js:445](../src/utilities.js#L445)), which reads
   `imageIds[Math.floor(0 / 2)]`: `undefined`.
2. `metaData.get` hands that to the wadouri parser, which calls
   `imageId.indexOf(':')` and throws "reading 'indexOf'". DevTools hides that
   frame by default, so the stack appears to end in `getFrameGeometry`.
3. The catch toasts the error, but `setIsInitialized(true)` still runs. The
   viewer mounts on a volume that was never created, and each pane toasts
   "getImage: imageId must not be undefined".

## 2. The fix

Right after the tools and operations bar are configured for the exam, and
before the load, an empty frame list stops the run
([MaskReviewIEC.jsx:300](../src/features/mask-review/MaskReviewIEC.jsx#L300)):

- `hasNoFrames` is set, and the spinner comes down;
- the render shows `ViewportPlaceholder` with `messages.viewport.noMaskedImages`
  ([MaskReviewIEC.jsx:488](../src/features/mask-review/MaskReviewIEC.jsx#L488)).
  It is the neutral placeholder, not an error, since nothing failed;
- `isInitialized` stays false, so `usePreviousMaskOverlay` (gated on it) never
  reads frame 0.

`hasNoFrames` is cleared whenever the IEC changes
([MaskReviewIEC.jsx:366](../src/features/mask-review/MaskReviewIEC.jsx#L366)),
so moving from an empty exam to a normal one doesn't keep the message.

## 3. Not changed

- With Masking Status "All", the mask review list still includes exams that
  haven't been masked yet. Whether to leave them out is a decision about the
  list, not part of this fix.
- `getIECInfo` still treats a failed `reviewfiles` request the same as an empty
  one, so a server error also shows this empty state rather than an error.

## 4. Testing

Manual — no automated tests were added.

1. In mask review, open an exam whose masking status is `created`.
2. The viewer shows "No masked images to review for this exam yet."; no error
   toasts appear and the spinner is gone.
3. Press Next onto an exam that has been masked. It loads normally, without the
   message.

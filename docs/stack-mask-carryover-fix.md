# Stack Mask Carry-over Fix — Implementation Notes

When curators masked several stacks in a row, every stack after the first was
submitted with the **first stack's selection box**. The same stale state also
let a volume be accepted with the previous volume's box, skipping the Expand
check.

**Branch:** `stack-mask-carryover-fix` (from `stack-single-selection-fix`, see
[stack-single-selection-fix.md](stack-single-selection-fix.md))

**Audience:** developers touching the mask route's accept / clear path or the
per-exam state in `MaskIEC`.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Resets the selection per exam and on Clear; stack Accept always reads the current drawing |

---

## 1. The problem

`MaskIEC` keeps the selection that will be submitted in two pieces of React
state ([MaskIEC.jsx:153-154](../src/features/mask/MaskIEC.jsx#L153-L154)):

- `coords` — the IJK box sent by `submitFinalCoords`.
- `expanded` — whether a volume selection has been expanded to 3D; Accept on a
  volume is refused until it is true.

In the mask VR route, [MaskVR.jsx](../src/features/mask/MaskVR.jsx#L37) renders
one `MaskIEC` and only changes its `iec` prop as the curator moves through the
queue. The component is never remounted, so its state lives across exams.
Nothing reset `coords` or `expanded` when the exam changed.

**Stacks.** Accept only computed the box when none was stored yet:

```js
if (!coords) {
  finalCoords = getCoordsForStackSeg(imageIds);
  setCoords(finalCoords);
}
```

The first stack's Accept stored its box. On every later stack `coords` was
already set, so the current drawing was never read and the first stack's box
was submitted again. Clear didn't reset `coords` either, so clearing and
redrawing didn't help.

**Volumes.** After a volume was accepted, `expanded` stayed `true` and `coords`
held its box. On the next volume, pressing Accept without Expand passed the
`volumetric && !expanded` check and submitted the previous volume's box.

The labelmap itself was not carried over: `loadStackSegmentation` builds new
labelmap images with fresh `derived:<uuid>` ids for every exam
([utilities.js:526](../src/utilities.js#L526)). Only the React state leaked.

## 2. The fix

Three small changes in `MaskIEC.jsx`:

1. **Reset per exam** ([MaskIEC.jsx:226-227](../src/features/mask/MaskIEC.jsx#L226-L227)).
   The load effect — which runs whenever `iec` or `optionsDecimate` changes —
   now clears `coords` and sets `expanded` to `false` before loading. A decimate
   change reloads the volume with a new segmentation, so its old selection is
   gone too and resetting there is correct.
2. **Reset on Clear** ([MaskIEC.jsx:488](../src/features/mask/MaskIEC.jsx#L488)).
   `handleClear` already reset `expanded`; it now also clears `coords`.
3. **Stack Accept always reads the drawing**
   ([MaskIEC.jsx:512](../src/features/mask/MaskIEC.jsx#L512)). A stack has no
   Expand step, so there is nothing worth caching. Accept now always calls
   `getCoordsForStackSeg` on the current labelmap.

Change 3 alone fixes stacks; changes 1 and 2 are what fix volumes, and they
guard stacks against any future reader of `coords`.

## 3. With the single-selection fix

This branch is built on `stack-single-selection-fix`, where a new stack
rectangle replaces the previous one. Together:

- the stack labelmap only ever holds the last rectangle drawn, and
- Accept always reads that labelmap for the exam on screen.

So a stack Accept submits exactly the rectangle the curator can see.

## 4. Testing

Manual — no automated tests were added.

**Stacks**

1. In the mask VR route, draw a box on a stack and Accept.
2. On the next stack exam, draw a box in a clearly different place and Accept.
3. The submitted coordinates (logged by `handleAccept`, and in the masking
   request) match the second box, not the first.
4. On a stack, draw, Clear, draw elsewhere, Accept — the second box is sent.

**Volumes**

1. Expand and Accept a volume.
2. On the next volume exam, draw a box and press Accept without Expand.
3. The "expand first" message appears and nothing is submitted.
4. Expand and Accept — the new box is sent.

**Decimate**

1. On a volume, draw and Expand, then change Decimate and apply it.
2. Accept asks for Expand again instead of submitting the old box.

# Mask Draft Decimation Fix — Implementation Notes

A drawn but unsubmitted mask box now stays on the same slices when Decimate
changes. Before, lowering Decimate and raising it again left a smaller box.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Keep a drafted mask box on its slices across Decimate

**Audience:** developers touching mask drafts, `getIECInfo`, or decimation.
Drafts are introduced in [masking-improvements.md](masking-improvements.md)
§4.7.

**Modules:**

| File | Responsibility |
|---|---|
| [src/utilities.js](../src/utilities.js#L209) | `getIECInfo` returns `sourceIndices` |
| [src/lib/maskDrafts.js](../src/lib/maskDrafts.js) | Converts drafts to and from full-series slices; keeps untouched drafts |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx#L273) | Holds the current load's `sourceIndices` and passes it to every draft call |

---

## 1. The problem

`maskDrafts` saves the selection's IJK bounding box per IEC, and restores it
once the next load's segmentation exists. Changing Decimate reloads the exam, so
it goes through the same save and restore.

`i` and `j` survive a reload: decimation only drops slices. `k` doesn't. Slice
40 at Decimate 0 and slice 40 at Decimate 10 are different slices, and a `k`
beyond the new slice count was simply clamped. So:

1. Draw a box, then lower Decimate. The saved `k` range is clamped or shifted
   onto the smaller volume.
2. That smaller box is saved as the draft on the next save.
3. Raise Decimate again. The smaller box comes back.

The selection seeded from the exam's submitted mask was never affected: it is
resolved from millimetres for whatever volume is loaded.

## 2. The fix

### Full-series slice numbers

`getIECInfo` also returns `sourceIndices`: for each kept frame, its index in the
undecimated series ([utilities.js:209](../src/utilities.js#L209)). It is
built from a frame → index map before decimating, so it is exact, including
the last frame that `decimateFrames` always appends.

Drafts now store `k` in those full-series numbers:

- **Saving** (`rememberMaskSelection`,
  [maskDrafts.js:152](../src/lib/maskDrafts.js#L152)) maps the loaded `k` range
  through `sourceIndices` (`toSeriesSlices`,
  [maskDrafts.js:76](../src/lib/maskDrafts.js#L76)).
- **Restoring** (`restoreMaskSelection`,
  [maskDrafts.js:222](../src/lib/maskDrafts.js#L222)) maps it back to the loaded
  slices (`fromSeriesSlices`,
  [maskDrafts.js:88](../src/lib/maskDrafts.js#L88)).

### Rounding outward

At a coarser Decimate the draft's edge slices may not be loaded. Restoring then
picks the nearest loaded slice **outside** the range: at or below the min, at or
above the max. The box always covers every slice that was drawn. If the curator
accepts at that Decimate, the mask is slightly larger rather than missing an
edge slice, which could otherwise leave PHI there unmasked.

### Untouched drafts aren't overwritten

Rounding outward still changes the box at a coarse Decimate, and the live saver
saves on every `SEGMENTATION_DATA_MODIFIED`, including the one the restore
fires. Without care, the rounded box would replace the precise draft.

`restoreMaskSelection` records the bounds it applied (`restoredBounds`,
[maskDrafts.js:24](../src/lib/maskDrafts.js#L24)), and `rememberMaskSelection`
returns early while the selection still equals them
([maskDrafts.js:166](../src/lib/maskDrafts.js#L166)). The first real edit
clears the record and saves normally. So going 0 → 10 → 0 without touching the
box gives back the exact original.

### Wiring

MaskIEC keeps the current load's `sourceIndices` in `sourceIndicesRef`
([MaskIEC.jsx:510](../src/features/mask/MaskIEC.jsx#L510)) and passes it to the
restore ([MaskIEC.jsx:434](../src/features/mask/MaskIEC.jsx#L434)) and all three
saves: the teardown save
([MaskIEC.jsx:654](../src/features/mask/MaskIEC.jsx#L654)), the resize commit
([MaskIEC.jsx:981](../src/features/mask/MaskIEC.jsx#L981)), and the live saver
([MaskIEC.jsx:1255](../src/features/mask/MaskIEC.jsx#L1255)). The teardown save
runs before the next load replaces the ref, so it always converts with the
mapping of the volume the box was drawn on.

## 3. Not changed

- Drafts are still in-memory and tab-lifetime.
- The seed from the submitted mask, Accept, and the box overlays all keep
  working in the loaded volume's own IJK; only the stored draft changed form.
- Stacks use the same mapping: their labelmap `k` is also an index into the
  decimated frame list.

## 4. Testing

Manual — no automated tests were added.

1. Open a volume exam in the mask route with Decimate 0. Draw a box spanning a
   known slice range.
2. Set Decimate to 10 and apply. The box covers the same anatomy, possibly a
   little larger at its top and bottom.
3. Set Decimate back to 0 without editing the box. It is exactly the original
   box.
4. Repeat, but resize the box at Decimate 10. Back at 0, the box matches the
   edited version.
5. Navigate away and back. The draft is restored on the same slices.

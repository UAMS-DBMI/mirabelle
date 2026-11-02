# NIfTI View Mode Window Fix — Implementation Notes

Going back to Volume no longer burns a NIfTI's 2D panes white, and a damaged file
that has lost its middle slice no longer opens white. MIP also has a window of
its own now.

**Branch:** `nifti-projection-issue-fix-clear-all-errors-develop-main`

**Commit:** Keep a NIfTI's window across view-mode changes

**Audience:** developers touching the view modes or how NIfTI volumes are
windowed.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/nifti-review/niftiViewWindow.js](../src/features/nifti-review/niftiViewWindow.js) | The window a NIfTI shows in each view mode |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) | Applies that window at the end of the view-mode effect |
| [src/features/nifti-review/niftiLoadingWindow.js](../src/features/nifti-review/niftiLoadingWindow.js) | `middleSliceWindow`: a window even when the middle slice is lost |

---

## 1. The symptom

The 2D panes showed a solid white shape with hard edges on black: every non-zero
voxel was white. It happened in two cases:

- **Any NIfTI, after Volume → MIP → Volume.** The narrow window then carried over
  into the next MIP, which is why this first looked like a MIP problem. The file
  did not need to be damaged.
- **A file damaged before its middle slice, on first load.** Coronal and sagittal
  were white. Axial was black, because it opens on the zero-filled middle slice.

## 2. Root causes

### 2.1 Cornerstone's reset goes back to the window from mount time

A NIfTI file has no window, so
[niftiLoadingWindow.js](../src/features/nifti-review/niftiLoadingWindow.js) gives
it one in the metadata and updates the panes as slices arrive. The viewer mounts
early, so it usually mounts on the `[0, 1]` placeholder or on the range of the
first slices.

Clicking Volume runs two resets, and neither knows the final window:

1. `resetProperties()` sets the window from the metadata, which is correct. Then
   `_resetProperties` overwrites it with `initialTransferFunctionNodes`, the
   transfer function captured once in `setVolumes`.
2. `resetToDefaultProperties()` applies `globalDefaultProperties.voiRange`, which
   `setProperties` fills from its first call. On a NIfTI, that call is the first
   window shown while loading.

On a `[0, 1]` window, every voxel above 1 is white.

### 2.2 A zero-filled middle slice has no range

The final window was the middle slice's range. A file truncated before that slice
leaves it zero-filled, so its range is `[0, 0]`, and the panes ended up on `[0, 1]`.

### 2.3 MIP and the middle slice's range

MIP shows the brightest voxel along each ray, from every slice, which can be well
above the middle slice's range. This one is a limit rather than a bug, and the
window it clips against is only the slices' default. Giving MIP its own window was
first tried as the fix for the symptom, which it wasn't, and was kept because MIP
then has usable contrast whatever the slices' window.

## 3. The fix

The view-mode effect sets the window **after** the resets, from
`niftiViewWindow(volume, viewMode)`:

| `viewMode` | Window on a NIfTI |
|---|---|
| `volume` | The slices' window from the metadata, as first shown |
| `min_projection` | The same |
| `projection` | From the projected values (below) |

It returns `null` for anything that isn't a NIfTI, so DICOM exams go through the
same effect exactly as before. Re-applying the window was chosen over patching
Cornerstone's reset: it is much smaller, and a DICOM window is already correct at
mount.

**MIP's window** takes the brightest value along each ray through the slices,
leaves out rays that only cross empty space, and uses the 1st to 99.9th percentile
of what's left, so a few stray voxels don't flatten the image. Volumes over about
20 million voxels skip slices to keep the click fast. The rays run along the
stored slice axis only, and all three panes share the result.

**The middle slice** (`middleSliceWindow`): when its range is empty, the final
window is the range of the slices received before it.

## 4. What was checked

The real viewer, driven headless in Chrome on synthetic 64 × 64 × 60 int16 volumes,
with every `/papi` call mocked, so no patient data was involved. The share of lit
pixels that are white, in the three panes:

| Step | Intact | Cut, middle slice kept | Cut, middle slice lost |
|---|---|---|---|
| First load | 0% | 0% | 0% (was 0 / 100 / 100%) |
| → MIP | 0% | 0% | 0% |
| → Volume | 0% | 0% | 0% (was 0 / 100 / 100%) |
| → MinIP, → Volume | 0% | 0% | 0% |
| Bare `resetProperties()`, for comparison | 100% | 100% | 0 / 100 / 100% |

The windows were `[0, 700]` on Volume and MinIP. On MIP they ran up to 700 from a
lower bound between about 490 and 630.

The last row confirms 2.1 in the running app: the reset on its own lands on `[0, 1]`.

Real damaged files were not part of this check.

## 5. Limitations

- **Entering MIP replaces a window the curator set**, on NIfTI volumes. Before this
  fix, MIP kept it. Going back to Volume already reset it.
- **Clicking MIP while the file is still loading** gives a window from the slices
  received so far, and the panes stop following new slices. Switching to Volume and
  back to MIP once it has loaded recalculates it.
- **DICOM still runs both resets.** From reading the code, the first `setProperties`
  on a DICOM pane (such as the first step of a window-level drag) is where
  `resetToDefaultProperties` returns it. This was not changed or tested.

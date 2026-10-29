# NIfTI Single-File Tools Fix — Implementation Notes

The single-file NIfTI review route (`/review/nifti/file/:file`) now shows the
same tools as the NIfTI VR route: the View buttons, Crosshairs, Preset, Volume
Opacity, and the "Nifti File Review" title.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Keep the NIfTI viewer's tools on the single-file route

**Audience:** developers touching route components or a viewer's UI setup.

**Modules:**

| File | Responsibility |
|---|---|
| [src/routes/nifti/RouteNiftiReviewFile.jsx](../src/routes/nifti/RouteNiftiReviewFile.jsx#L26) | Resets the options and presentation config in a layout effect |

---

## 1. The problem

Two effects configure the left panel on this route, and they ran in the wrong
order.

1. `NiftiReviewFile`'s load effect starts by configuring the UI for a NIfTI
   volume, before its first `await`
   ([NiftiReviewFile.jsx:212-216](../src/features/nifti-review/NiftiReviewFile.jsx#L212-L216)):
   the title, then `reset()`, `setVisualReviewConfig()`, `setVolumeConfig()`
   and `setNiftiConfig()`. Those are what turn on View, Crosshairs, Preset and
   Volume Opacity.
2. The route's own effect resets for a fresh visit: `resetOptions()`, `reset()`
   and `setVisualReviewConfig()`.

React runs child effects before parent effects, so step 2 ran after step 1.
`resetOptions()` cleared the title
([optionSlice.js:105](../src/features/optionSlice.js#L105)), and `reset()`
dropped the volume and NIfTI config
([presentationSlice.js:209](../src/features/presentationSlice.js#L209)).
`setVisualReviewConfig()` then brought back only the basic Window/Level and
Zoom/Pan buttons.

### Why the VR route was fine

`RouteNiftiReviewVR` runs the same reset, but it doesn't render the viewer until
its file list has loaded
([RouteNiftiReviewVR.jsx:35](../src/routes/nifti/RouteNiftiReviewVR.jsx#L35)).
That is a network request, so `NiftiReviewFile` mounts and configures the UI
after the reset, and nothing undoes it.

The other single-exam routes (DICOM review, mask, mask review) configure their
UI only after an `await`, so their route's reset has already run by then.

## 2. The fix

The route's reset is now a `useLayoutEffect`
([RouteNiftiReviewFile.jsx:26](../src/routes/nifti/RouteNiftiReviewFile.jsx#L26)).
React runs every layout effect in the tree before any regular effect, so the
reset now runs first and `NiftiReviewFile`'s setup wins.

The reset itself is kept. `resetOptions()` is what clears options left over from
another route, such as a MIP view mode.

`NiftiReviewFile` has its own layout effect, which runs before the route's. It
only creates the rendering engine and the tool groups, and doesn't touch the
Redux state the reset clears, so the order there doesn't matter.

## 3. Testing

Manual — no automated tests were added.

1. Open `/review/nifti/file/<id>` directly, in a new tab.
2. The header reads "Nifti File Review", and the left panel shows View,
   Left-Click (Window/Level and Crosshairs), Right-Click, Preset and Volume
   Opacity, matching the NIfTI VR route.
3. Switch to MIP on another route, then open the single-file route. It starts in
   the normal volume view.

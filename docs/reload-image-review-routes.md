# Reload Image on the Review Routes — Implementation Notes

The Reload Image button, until now only on the mask route, is in the details
panel of DICOM review, mask review and NIfTI review too.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Add Reload Image to the review routes

**Audience:** developers touching a route's load effect or the cache.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/dicom-review/DicomReviewIEC.jsx](../src/features/dicom-review/DicomReviewIEC.jsx#L482) | `handleReload`, also on the error placeholder |
| [src/features/mask-review/MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx#L392) | `handleReload` |
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx#L367) | `handleReload`, and forgetting the file's last outcome |
| [src/features/nifti-review/niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js#L105) | `forgetNiftiFileRead` |

---

## 1. How reloading works

`DetailsPanel` shows the button whenever it gets an `onReload` prop
([DetailsPanel.jsx:89](../src/features/details/DetailsPanel.jsx#L89)). The mask
route's `handleReload`
([MaskIEC.jsx:705](../src/features/mask/MaskIEC.jsx#L705)) is the model:

1. Drop the cached exam: `decacheVolume(volumeId)` for a volume,
   `removeCachedImages(imageIds)` for a stack.
2. Bump a `reloadToken` that is in the load effect's dependencies, so the
   effect runs again.

Failed downloads are never cached (Cornerstone skips errored frames and the
browser doesn't cache the error response), so the re-run genuinely fetches the
missing slices again. See [cache-management.md](cache-management.md) for the
cache side.

## 2. DICOM review and mask review

Both copy the mask route exactly: a `reloadToken` state, `reloadToken` added to
the load effect's dependencies
([MaskReviewIEC.jsx:388](../src/features/mask-review/MaskReviewIEC.jsx#L388)),
a `handleReload`, and `onReload={handleReload}` on `DetailsPanel`.

Their effect cleanups already remove all segmentations, so a re-run starts from
a clean state.

DICOM review's error state returns a full-page `ViewportPlaceholder` with no
details panel, so the button would be unreachable exactly when it's needed. That
placeholder now carries a Reload Image action
([DicomReviewIEC.jsx:541](../src/features/dicom-review/DicomReviewIEC.jsx#L541)),
as on the mask route. Mask review and NIfTI review keep their details panel in
the error state, so they need nothing extra.

## 3. NIfTI review

NIfTI needs one more step. `niftiFileRead.js` records how each file's download
ended, per URL, and `watchNiftiFileRead` replays that outcome straight away to
the next watcher
([niftiFileRead.js:39](../src/features/nifti-review/niftiFileRead.js#L39)). A
file that loaded fine would therefore report "read" the moment the reloaded
run started watching, and the spinner would clear while the file was still
downloading again.

- `handleReload` decaches the volume, sets `isReloadingRef`, and bumps
  `reloadToken`.
- The re-run, once it knows the file's URL, sees the ref and calls
  `forgetNiftiFileRead(url)`
  ([NiftiReviewFile.jsx:252](../src/features/nifti-review/NiftiReviewFile.jsx#L252))
  before it starts watching. The spinner then waits for the new download.

`takeNiftiLoadFailure` already did this for failed files; `forgetNiftiFileRead`
does it for any outcome.

## 4. Testing

Manual — no automated tests were added.

1. On each of DICOM review, mask review and NIfTI review, open an exam and press
   Reload Image. The spinner comes back and the images load again.
2. NIfTI: the spinner stays up until the file has fully downloaded, not just
   for a moment.
3. DICOM review: make an exam fail to load (for example, go offline briefly).
   The error placeholder shows a Reload Image button that loads it again.

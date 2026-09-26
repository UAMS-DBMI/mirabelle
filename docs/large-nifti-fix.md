# Large NIfTI Fix — Implementation Notes

How the NIfTI review route loads files too large to decode in the browser. A
4D series now loads by keeping only the volume the viewer shows, its slices
fill the viewports while the file downloads, and a file that still can't be
shown says why instead of failing with a generic error and an endless spinner.

**Audience:** developers working on the NIfTI review routes or the patched
`@cornerstonejs/nifti-volume-loader`.

**Branch:** `large-nifti-fix-develop`, on top of
`truncated-nifti-recovery-develop` ([truncated-nifti-recovery.md](truncated-nifti-recovery.md)
covers damaged files, which this loader still handles).

**Modules:**

| File | Responsibility |
|---|---|
| [patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch](../patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch) | Loader side: the streaming loader in `cornerstoneNiftiImageLoader.js` and the `NIFTI_FILE_READ` event in `enums/Events.js` |
| [src/features/nifti-review/niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js) | Records how each file's download ended (read to the end, or failed), notifies watchers, picks the failure headline |
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx) | Shows the failure toast and placeholder, holds the spinner until the file is read, retries a failed file on revisit |
| [src/lib/notify.js](../src/lib/notify.js) | Remembers which error objects it has shown (`notify.wasShown`) |
| [src/lib/installGlobalErrorHandlers.js](../src/lib/installGlobalErrorHandlers.js) | Skips unhandled rejections for errors a page already showed |
| [src/lib/messages.js](../src/lib/messages.js) | `errors.niftiTooLarge`, the curator-facing text |

---

## 1. The symptom

A 4D perfusion file (about 715 MB gzipped) never displayed on
`/mira/review/nifti/vr/...`:

- a toast: "Something went wrong. Please try again." with the detail
  `Array buffer allocation failed`;
- a "Loading..." spinner over black viewports that never went away.

Desktop viewers such as MRIcroGL open the same file, and smaller files load
fine.

## 2. Root cause: the whole series was decoded to show one volume

The file is 4D: 240 × 240 × 155 voxels × 60 time points, stored as 64-bit
floats. One volume is 71 MB; all 60 are 4.29 GB.

The viewer only ever shows the first volume.
`createNiftiImageIdsAndCacheMetadata` makes one image id per slice of the first
3D volume, and `createImage` cuts frames from the start of the data. The
loader decoded everything anyway:

1. It downloaded the whole file into one 715 MB `ArrayBuffer`.
2. `NiftiReader.decompress` is fflate's `gunzipSync`, which allocates its
   output up front from the gzip trailer's size field: one 4.29 GB
   `Uint8Array`. Chrome refused (`RangeError: Array buffer allocation
   failed`).
3. The truncated-file recovery path caught that `RangeError` as if the file
   were damaged, and tried again with a streaming inflate plus a
   concatenation, which needs even more memory.
4. Had decompression worked, `readImage` and `modalityScaleNifti` would each
   have copied all 60 volumes again, and the result would not have fit the
   image cache (at most 4 GB on auto sizing).

### Why the spinner never stopped and the toast was generic

Every frame except the first polled a shared fetch state every 10 ms
(`waitForNiftiData`). When the fetch threw, that state stayed at `fetching`,
so the other frames polled forever and the volume never finished loading. The
rejection itself escaped from Cornerstone's image cache as an unhandled
rejection, which the global handler turns into the generic "Something went
wrong" toast.

## 3. What the curator sees now

- **Large 4D files load.** Only the first volume is kept: 71 MB for the file
  above.
- **Slices fill the viewports as the file streams**, as DICOM exams do. For a
  4D file the first volume is complete after a small part of the download.
- **The spinner stays up until the whole file has been read**, because only
  then is it known whether the file is intact. A damaged file's warning (see
  [truncated-nifti-recovery.md](truncated-nifti-recovery.md)) is therefore on
  screen before loading is shown as finished.
- **A file that can't be shown says why**, in one toast, with the neutral
  placeholder instead of a black viewer:
  - too large for the browser: "This NIfTI file is too large to display in
    the browser. Use Download to open it in a desktop viewer." with the size
    as the detail, e.g. `This NIfTI volume (1024 × 1024 × 2000, 8-Byte Float,
    16.8 GB) is larger than the 4.3 GB image cache.` This happens as soon as
    the header arrives, and the rest of the download is cancelled;
  - anything else (an HTTP or network error, not a NIfTI file): "Couldn't load
    this image." with the reason as the detail.
- **A failed file is retried on the next visit** instead of showing blank.

## 4. Loader side (the patch)

All of this lives in `dist/esm/cornerstoneNiftiImageLoader.js`, applied
through `patch-package` on `postinstall`.

### 4.1 One streaming pass, first volume kept

Each file gets one `NiftiFileLoad`, shared by all its frames (`fileLoadFor`).
It streams the download with `fetch` and a body reader, through fflate's
streaming `Gunzip` when the first bytes are the gzip magic, or straight
through for a plain `.nii`. There is no whole-buffer decompression any more.

`FirstVolumeCollector` takes the decoded bytes in whatever chunks they come:

1. It reads the header once 540 bytes (a NIfTI-2 header) have arrived, or
   from whatever arrived if the file ends sooner.
2. It allocates a zero-filled buffer for the **first 3D volume only**
   (`dims[1] × dims[2] × dims[3] × bitpix / 8`) and copies the bytes from
   `vox_offset` on into it.
3. Each time one or more z-slices fill up, it passes them on, and frees its
   raw copy once the whole volume has been passed on.
4. Past the first volume it only counts bytes. The rest of the file is still
   decoded, so damage anywhere in it, including a missing gzip trailer, is
   still detected (`isComplete` compares the count with every volume the
   header declares).

### 4.2 Frames resolve as their slices arrive

`NiftiFileLoad.addSlices` converts each run of slices for display with
`modalityScaleNifti` into the volume's scalar data, then resolves the frames
waiting on them (`whenReady`):

- an axial frame is one z-slice, stored contiguously, so it waits for its own
  slice;
- a sagittal or coronal frame (the patch's `sliceDimIndex` 0 or 1) takes a row
  from every z-slice, so it waits for the whole volume.

`modalityScaleNifti` rewrites `numBitsPerVoxel` on the header it is given, but
the collector keeps sizing the file from that header while slices convert. So
`scaleToScalarData` passes it only the fields it reads (`datatypeCode`,
`scl_slope`, `scl_inter`).

### 4.3 How a load ends: `NIFTI_FILE_READ`

`enums/Events.js` gains:

```js
Events["NIFTI_FILE_READ"] = "CORNERSTONE_NIFTI_FILE_READ";
```

It fires once per download, on Cornerstone's `eventTarget`, with
`{ url, error }`:

- `error` is null once the whole file has been read. A damaged file fires
  `NIFTI_VOLUME_TRUNCATED` first, after the slices it never filled have been
  passed on zero-filled (black);
- otherwise `error` is what the load failed with.

On failure the event fires **before** the waiting frames reject with that same
error. Every frame of the file rejects, so Cornerstone's volume finishes
loading, and the failed load is forgotten so the next visit starts a new one.

### 4.4 Files too large to show

Before allocating the first volume, the loader checks it against the image
cache (`cache.isCacheable`). Two out-of-memory failures are restated the same
way: a `RangeError` from an allocation, and `CACHE_SIZE_EXCEEDED` from
`modalityScaleNifti` (whose output can be wider than the stored type). Each
becomes an `Error` named `NiftiTooLargeError` that gives the volume's size:

> This NIfTI volume (1024 × 1024 × 2000, 8-Byte Float, 16.8 GB) is more than
> the browser could allocate.

(Sizes are decimal: 1 GB = 10⁹ bytes.) An HTTP error fails with
`Couldn't download the NIfTI file (HTTP <status>).`

## 5. App side

### 5.1 `niftiFileRead.js`

One listener on `NIFTI_FILE_READ`, registered when the module is imported,
records each file's outcome by URL. Revisits are served from Cornerstone's
cache without a new download, so the recorded outcome is what tells a revisit
that the file was already read.

- `watchNiftiFileRead(url, onRead)` calls `onRead({ url, error })` right away
  for a file already read, otherwise when the event arrives. It returns an
  unsubscribe function.
- `takeNiftiLoadFailure(url)` reports and forgets a failed outcome. A failed
  volume stays cached without pixel data and reports itself loaded, so the
  page removes it from the cache and loads the file again.
- `niftiLoadFailureMessage(error)` picks the toast headline:
  `errors.niftiTooLarge` for a `NiftiTooLargeError`, `errors.loadImage`
  otherwise. The loader's message is the detail line.

### 5.2 `NiftiReviewFile.jsx`

- Before watching, a revisit to a failed file drops its empty cached volume
  (`takeNiftiLoadFailure`), since the watch would otherwise replay the old
  failure.
- The spinner comes down only when **both** the volume has loaded
  (`startVolumeLoad`) **and** the file has been read (`NIFTI_FILE_READ`).
- A failure shows one toast, swaps the viewer for `ViewportPlaceholder`, and
  takes the spinner down.
- Every callback checks `isStale()`, so a file the curator has left can't
  touch the next file's view.

### 5.3 One toast per error

Cornerstone reports a failed frame twice: `IMAGE_LOAD_FAILED`, and an
unhandled rejection from its image cache that no caller can catch.
`notify.error` now remembers the error objects it shows (a `WeakSet`), and the
global unhandled-rejection handler skips any error `notify.wasShown` reports.
The loader fires `NIFTI_FILE_READ` before the frames reject, so the page's
toast always comes first.

## 6. Limitations and known gaps

- **The spinner stays up for the whole download.** For a 715 MB 4D file the
  image is complete in seconds, and the spinner then stays up for the rest of
  the download (a minute or more). Grading isn't blocked meanwhile.
- **Only axial files fill in slice by slice.** Sagittal and coronal
  acquisitions appear when their whole first volume is in.
- **A large single 3D volume can still be too big.** Only 4D files get
  smaller. A 3D volume beyond the image cache or the browser's allocation
  limit fails with the size message in §4.4 and has to be opened in a desktop
  viewer.
- **A network error mid-download fails the load.** It is not treated as a
  damaged file, because the stored file may be fine.
- **Leaving a file doesn't stop its download.** That was already so; the
  `image-navigation-fix-develop` branch pauses it (see its
  `docs/image-navigation-fix.md`).
- **Inflating runs on the main thread**, in small per-chunk steps.
- **Verification:** each commit was checked with ESLint and a production build.
  The author didn't open production files (PHI), so confirm on the original 4D
  file in the running app before merging.

## 7. Maintaining the patch

- **After pulling this change, restart the dev server.** Webpack treats
  `node_modules` as immutable and won't pick up patched files during a live
  reload.
- **`patch-package` can't regenerate the patch in this repo** (it needs a
  `package-lock.json` or `yarn.lock`). Rebuild it by hand, offline:
  1. copy the installed `@cornerstonejs/nifti-volume-loader` into a scratch
     directory under `node_modules/@cornerstonejs/`, `git init` it, and
     `git apply -R` the current patch to get the pristine package; commit it;
  2. copy the edited `dist/esm` files over it and run `git diff`;
  3. check the result with `git apply --check` against the pristine commit,
     and replace the file in `patches/`.
- **If the loader is upgraded upstream**, re-check that
  `cornerstoneNiftiImageLoader` still loads a file once per URL and cuts
  frames from its scalar data, which is the shape this patch replaces.

# Truncated NIfTI Recovery — Implementation Notes

How the NIfTI review route handles a damaged `.nii.gz`. Instead of failing with
a generic error and an endless spinner, it now shows whatever part of the file
can still be decoded, the way MRIcro and 3D Slicer do. It also keeps a
persistent error toast up, so the curator knows the file is corrupted and can
grade it accordingly.

**Audience:** developers working on the NIfTI review routes or the patched
`@cornerstonejs/nifti-volume-loader`.

**Modules:**

| File | Responsibility |
|---|---|
| [patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch](../patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch) | Loader side: the recovery path in `cornerstoneNiftiImageLoader.js` and the new `NIFTI_VOLUME_TRUNCATED` event in `enums/Events.js` |
| [src/features/nifti-review/niftiTruncation.js](../src/features/nifti-review/niftiTruncation.js) | Remembers which files were damaged, notifies watchers, builds the toast's error |
| [src/features/nifti-review/niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js) | Records how each file's download ended (read to the end, or failed), notifies watchers |
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx) | Watches the file being loaded, shows the toasts, holds the spinner until the file is read |
| [src/lib/messages.js](../src/lib/messages.js) | `errors.truncatedNifti`, the curator-facing text |

---

## 1. The symptom

Opening certain NIfTI files on `/mira/review/nifti/vr/...` showed:

- a toast: "Something went wrong. Please try again." with the detail
  `unexpected EOF`;
- a "Loading..." spinner over black viewports that never went away.

The same file opened in 3D Slicer and MRIcro, and the image looked correct
there. The Unarchiver refused to extract it.

## 2. Root cause: the file itself is truncated

When the details record says `is_zipped`, the viewer fetches the file's
`/data.gz` URL ([NiftiReviewFile.jsx:236](../src/features/nifti-review/NiftiReviewFile.jsx#L236)).
The loader then decompressed the whole buffer in one call to
`NiftiReader.decompress`, which is fflate's `gunzipSync`. It now streams the
file instead (§4).

`unexpected EOF` is fflate saying the compressed stream ended before its final
block. In other words, the file stops early. That is a problem with the stored
file, not with the server, the proxy or the viewer: The Unarchiver fails in
exactly the same way on the downloaded copy.

### Why other viewers still "work"

Slicer (ITK/zlib) and MRIcro are lenient. They keep whatever zlib decoded
before the stream broke and display it. Two cases look the same on screen:

1. **Only the last few bytes are missing** (the 8-byte gzip trailer, perhaps
   plus a sliver of data). All voxels are intact, so the image really is
   complete.
2. **Real data is missing.** Data is stored in order, so what gets lost is the
   end of the file. A DWI file stores several volumes one after another. The
   first volume, which is what these viewers show by default, can be intact
   while later volumes are partly or entirely gone.

Either way the file is broken for anyone who receives it. `gunzip`, archive
tools, browsers and many analysis libraries reject it, and there is no trailer
left to verify it. The damage happened upstream, during export, upload or
storage, so the file should be re-sent from its source.

### Why the spinner never stopped

The loader fetches each file once and makes every frame's request wait on that
single fetch (`dataFetchStateMap`). When the fetch threw, the entry stayed at
`status: 'fetching'`, and `waitForNiftiData` polled it forever. Every frame
now awaits one shared promise instead, so any failure rejects all of them, the
volume finishes loading, and the spinner comes down (§4.5).

## 3. What the curator sees now

- The viewports show the recovered data. Anything missing is zero-filled, so
  it appears black.
- An error toast stays up until the curator closes it (like every error toast,
  see `DURATION.error` in [notify.js](../src/lib/notify.js)):

  > This NIfTI file is corrupted. Only the part that could be read is shown;
  > missing data appears black.
  >
  > `unexpected EOF · 82.3% of image data recovered`

- The detail line keeps the decoder's reason, `unexpected EOF`, together with
  how much of the voxel data survived. It reads `all image data recovered`
  when only the gzip trailer is missing (case 1 above).
- The toast appears **on every visit** to the file, including revisits served
  from cache (§5).

Showing a partial image is deliberate, but it is never silent. A curator
should treat any file with this toast as damaged, however complete the image
looks.

## 4. Loader side (the patch)

All of this lives in `dist/esm/cornerstoneNiftiImageLoader.js`, and is applied
through `patch-package` on `postinstall`.

### 4.1 One streaming pass, first volume kept

Each file gets one `NiftiFileLoad`, shared by all its frames. It calls
`streamFile`, which streams the download (`fetch` + a body reader) through
fflate's streaming `Gunzip` when the first bytes are the gzip magic, or
straight through for a plain `.nii`. There is no whole-buffer
`NiftiReader.decompress` any more.

A `FirstVolumeCollector` takes the decoded bytes in whatever chunks they come:

1. It reads the header once 540 bytes (a NIfTI-2 header) have arrived, or
   from whatever arrived if the file ends sooner.
2. It allocates a buffer for the **first 3D volume only**
   (`dims[1] × dims[2] × dims[3] × bitpix / 8`) and copies the bytes from
   `vox_offset` onward into it. The buffer starts zero-filled.
3. Each time one or more z-slices fill up, it passes them on. `NiftiFileLoad`
   converts them for display (`modalityScaleNifti`) into the volume's scalar
   data and resolves every frame waiting on them. An axial frame waits for its
   own z-slice. A sagittal or coronal frame takes a row from every z-slice, so
   it waits for the whole volume.
4. It only counts bytes after that volume. The whole file still streams
   through the decoder, so damage anywhere in it, including a missing gzip
   trailer, is still detected.

Slice image ids only index into the first volume, so that is all the viewer
has ever shown. Keeping only it is what lets large 4D files load: a 60-frame
float64 perfusion series is 4.3 GB decoded, which the browser can't allocate
("Array buffer allocation failed"), but its first volume is 71 MB.

So the viewports fill in slice by slice while the file downloads, as DICOM
exams do. For a 4D file the first volume is complete after a small part of
the download.

When the stream ends, the loader fires `NIFTI_FILE_READ` with `{ url, error }`:
`error` is null once the whole file has been read (after
`NIFTI_VOLUME_TRUNCATED` if it is damaged), or the error it failed with. The
page keeps its spinner up until this fires and the volume has loaded, so a
damage warning is on screen before loading is shown as finished.

### 4.2 Telling truncation from corruption

`NiftiStreamDecoder` pushes each downloaded chunk with `push(bytes, false)`,
and `push(empty, true)` when the download ends. The split matters: a single
`push(bytes, true)` behaves like `gunzipSync` and throws **before** emitting
anything, so nothing could be recovered. We checked this against fflate 0.7.3
with synthetic data.

Where it throws also tells us what went wrong:

- **Thrown on the final push:** the input ran out, i.e. the file is
  truncated. fflate reports this as `invalid gzip data` (the trailer is
  missing), so we record it as `unexpected EOF`. That is what actually
  happened, and it matches the message users already know.
- **Thrown earlier:** the data is corrupt mid-stream (e.g. `invalid block
  type`). fflate's own message is kept, and decoding stops there.
- **No error, but fewer bytes than the header declares:** recorded as
  `the file ends before its image data does`.

### 4.3 Making the result loadable

If no header can be read (not a NIfTI, or fewer bytes decoded than a header),
the load fails with `The provided buffer is not a valid NIFTI file.` Otherwise
whatever part of the first volume didn't arrive stays zero-filled, the event
fires, and loading carries on exactly as for a healthy file. The buffer is
always full length, which matters because `modalityScaleNifti` builds typed
arrays from it (`new Float32Array(buf)` throws on a byte length that isn't a
multiple of 4), and `createImage` slices frames at fixed offsets.

### 4.4 The event

`enums/Events.js` gains:

```js
Events["NIFTI_VOLUME_TRUNCATED"] = "CORNERSTONE_NIFTI_VOLUME_TRUNCATED";
```

It is triggered on Cornerstone's `eventTarget`, and `event.detail` is:

| Field | Meaning |
|---|---|
| `url` | The absolute file URL, the same string the app passed to `createNiftiImageIdsAndCacheMetadata` |
| `reason` | `unexpected EOF`, fflate's message for corruption mid-stream, or `the file ends before its image data does` |
| `recoveredFraction` | Recovered voxel bytes ÷ expected voxel bytes, from 0 to 1, across **all** volumes in the file |

The loader also logs `console.warn('Loaded a damaged NIfTI file partially:', detail)`.

### 4.5 Failed loads and oversized files

When a file fails to load, `NiftiFileLoad` fires `NIFTI_FILE_READ` with the
error, then rejects every frame still waiting with that same error, so
Cornerstone's volume finishes loading. The failed load is forgotten so the
next visit retries.

Before allocating the first volume, the loader checks it against the image
cache (`cache.isCacheable`). A volume that doesn't fit, or whose allocation
throws a `RangeError`, fails with a `NiftiTooLargeError` that names its size.
This happens as soon as the header arrives, so the rest of the download is
cancelled, e.g.:

> This NIfTI volume (1024 × 1024 × 2000, 8-Byte Float, 16.8 GB) is larger
> than the 4.3 GB image cache.

On the app side, [niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js)
passes the outcome to `NiftiReviewFile`, which shows one toast and the neutral
placeholder instead of a black viewer.
The headline is `errors.niftiTooLarge` for a `NiftiTooLargeError`, and
`errors.loadImage` otherwise. The loader's message is the detail line.
`notify` remembers which error objects it has shown. The event fires before
the frames reject, so the global unhandled-rejection handler skips them and
doesn't add a second, generic toast. A revisit removes the failed volume from
the cache and loads the file again. A network error after the first volume is
already on screen is handled the same way, since the rest of the file can't be
checked.

### 4.6 Pausing and resuming

The loader exports `pauseNiftiFileLoad(url)` and `resumeNiftiFileLoad(url)`.
`NiftiReviewFile` pauses its file when the curator leaves it (next, previous,
or another page) and resumes it on the next visit. Pausing cancels the
download but keeps the decoder, the collected first volume and every waiting
frame. Resuming asks for the rest of the file with `Range: bytes=<read>-`. If
the server sends the whole file again (a 200 instead of a 206), the bytes
already read are skipped. A server that compresses responses on the fly is
never sent a Range header, since its ranges would count compressed bytes.

DICOM exams pause the same way through
[examDownloads.js](../src/lib/examDownloads.js), which queues the DICOM
loader's requests.

## 5. App side

### 5.1 `niftiTruncation.js`

The loader fires the event **once per fetch**. After that, the volume is
served from Cornerstone's cache, and a revisit doesn't touch the loader at
all. A listener that only lives in the component would therefore warn on the
first visit and never again.

So the module registers one listener on `eventTarget` when it is imported, and
records each damaged URL in a module-level `Map`:

- `watchNiftiTruncation(url, onTruncated)` calls `onTruncated` right away if
  the URL is already known to be damaged. Otherwise it calls it when the event
  arrives for that URL. It returns an unsubscribe function.
- `truncationError(detail, userMessage)` builds an `Error` whose `userMessage`
  is the friendly text and whose `message` is
  `"<reason> · <n>% of image data recovered"`. `notify.error` shows the first
  as the toast text and the second as the muted detail line.
- The percentage **rounds down** to one decimal place, so a file missing even a
  sliver never claims 100%.

If the volume is evicted from the cache and fetched again, the event fires
again and simply overwrites the `Map` entry.

### 5.2 `NiftiReviewFile.jsx`

- The load effect starts watching as soon as the file URL is known, **before**
  `createNiftiImageIdsAndCacheMetadata`
  ([NiftiReviewFile.jsx:253](../src/features/nifti-review/NiftiReviewFile.jsx#L253)).
- The callback checks `isStale()`, so a damaged file the curator has already
  navigated away from can't raise a toast on the next file.
- The effect's cleanup calls `stopWatchingTruncation()`
  ([NiftiReviewFile.jsx:330](../src/features/nifti-review/NiftiReviewFile.jsx#L330)).

## 6. Limitations and known gaps

- **Only the first volume of a 4D file is displayed.** The loader has always
  done this, since `createImage` slices frames from the start of the data. So
  for a DWI file, the image can look complete while `recoveredFraction` is
  well below 100%, because the missing data sits in later volumes.
- **The spinner stays up for the whole download.** Slices show as they
  arrive, but the file is only known to be intact at its end (§4.1). For a
  700 MB 4D file the image is complete in seconds, and the spinner then stays
  up for the rest of the download. Grading isn't blocked meanwhile. Inflating
  runs on the main thread in small per-chunk steps.
- **A large single 3D volume can still be too big.** Only 4D files get
  smaller. A 3D volume beyond the image cache or the browser's allocation
  limit fails with the size message in §4.5, and has to be opened in a
  desktop viewer.
- **A network error mid-download fails the load.** It is not treated as a
  damaged file, because the stored file may be fine.
- **Transitive dependency.** The patch imports `Gunzip` from `fflate`, which
  `nifti-volume-loader` doesn't declare itself. It resolves to the hoisted
  `node_modules/fflate` (0.7.3), which `nifti-reader-js` depends on. If an
  upgrade stops hoisting it, the import breaks at build time rather than
  silently.
- **Not yet verified in the running app on a real damaged file.** The
  streaming loader has been checked with lint and a production build only.

## 7. Maintaining the patch

- **After pulling this change, restart the dev server.** Webpack treats
  `node_modules` as immutable and won't pick up patched files during a live
  reload.
- **`patch-package` can't regenerate the patch in this repo.** It refuses to
  run without a `package-lock.json` or `yarn.lock`, and this project uses
  `bun.lock`. The patch was rebuilt by hand instead:
  1. `npm pack @cornerstonejs/nifti-volume-loader@<installed version>` into a
     scratch directory, then extract it to
     `node_modules/@cornerstonejs/nifti-volume-loader`.
  2. `git init` and commit the pristine copy there.
  3. Copy the edited `dist/esm` files over it, then run `git diff`.
  4. Check that it applies with `git apply --check` against the pristine
     commit, and replace the file in `patches/`.
- **The patch filename says `3.33.4`, but `3.33.5` is installed.** The name
  wasn't changed, to keep the diff focused. `patch-package` warns about the
  mismatch and applies the patch anyway.
- The pristine copy can also be rebuilt offline: copy the installed package
  and `git apply -R` the current patch onto it.
- If the loader is upgraded upstream, re-check that `fetchAndProcessNiftiData`
  and `cornerstoneNiftiImageLoader` still have the shape the patch replaces:
  one fetch per URL, decompress, `readImage`, `modalityScaleNifti`.

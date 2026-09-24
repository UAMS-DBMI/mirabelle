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
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx) | Watches the file being loaded and shows the toast |
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
`/data.gz` URL ([NiftiReviewFile.jsx:216](../src/features/nifti-review/NiftiReviewFile.jsx#L216)).
The loader then decompresses the whole buffer in one call to
`NiftiReader.decompress`, which is fflate's `gunzipSync`.

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
`status: 'fetching'`, and `waitForNiftiData` polled it forever. The recovery
path fixes this for damaged files, because the fetch now completes. See §6 for
the failures it still doesn't cover.

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

### 4.1 Healthy files are unchanged

`fetchAndProcessNiftiData` now calls `decompressRecoverable` instead of
`NiftiReader.decompress`. That function still tries `NiftiReader.decompress`
first, so intact files take the same fast path as before. Only when it throws
does recovery run:

```js
function decompressRecoverable(url, compressed) {
    try {
        return NiftiReader.decompress(compressed);
    }
    catch (error) {
        return recoverPartialNifti(url, compressed, error);
    }
}
```

### 4.2 Decoding as much as possible: `inflateUntilError`

Recovery uses fflate's **streaming** `Gunzip`, which emits output chunks as it
decodes. It pushes the data in two steps:

1. `push(bytes, false)`: decode everything available. For a truncated stream
   this doesn't throw. The decoder just waits for more input.
2. `push(empty, true)`: tell it the input is finished. A truncated stream
   throws here.

This split is essential. A single `push(bytes, true)` behaves like
`gunzipSync`: it throws **before** emitting anything, so nothing could be
recovered. We checked this against fflate 0.7.3 with synthetic data. With the
two-step push, every byte decoded before the break came back and matched the
original data exactly.

Where it throws also tells us what went wrong:

- **Thrown on the final push:** the input ran out, i.e. the file is
  truncated. fflate reports this as `invalid gzip data` (the trailer is
  missing), so we record it as `unexpected EOF`. That is what actually
  happened, and it matches the message users already know.
- **Thrown earlier:** the data is corrupt mid-stream (e.g. `invalid block
  type`). fflate's own message is kept.

### 4.3 Making the result loadable: `recoverPartialNifti`

1. Join the decoded chunks and read the NIfTI header from them. If no header
   can be read (fewer bytes decoded than the header size, or not a NIfTI),
   **re-throw the original decompression error**. The file fails exactly as
   it did before this change.
2. Work out how many bytes the image should have from the header, using the
   same formula as `NiftiReader.readImage`:
   `dims[1] × dims[2] × dims[3] × (dims[4] || 1) × (dims[5] || 1) × bitpix / 8`.
3. Zero-fill the buffer up to `vox_offset + imageBytes`. This matters because
   downstream code assumes a full-length buffer: `modalityScaleNifti` builds
   typed arrays from it (`new Float32Array(buf)` throws on a byte length that
   isn't a multiple of 4), and `createImage` slices frames at fixed offsets.
4. Fire the event and return the padded buffer. From here, loading carries on
   exactly as for a healthy file.

### 4.4 The event

`enums/Events.js` gains:

```js
Events["NIFTI_VOLUME_TRUNCATED"] = "CORNERSTONE_NIFTI_VOLUME_TRUNCATED";
```

It is triggered on Cornerstone's `eventTarget`, and `event.detail` is:

| Field | Meaning |
|---|---|
| `url` | The absolute file URL, the same string the app passed to `createNiftiImageIdsAndCacheMetadata` |
| `reason` | `unexpected EOF`, or fflate's message for corruption mid-stream |
| `recoveredFraction` | Recovered voxel bytes ÷ expected voxel bytes, from 0 to 1, across **all** volumes in the file |

The loader also logs `console.warn('Loaded a damaged NIfTI file partially:', detail)`.

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
  ([NiftiReviewFile.jsx:220](../src/features/nifti-review/NiftiReviewFile.jsx#L220)).
- The callback checks `isStale()`, so a damaged file the curator has already
  navigated away from can't raise a toast on the next file.
- The effect's cleanup calls `stopWatchingTruncation()`
  ([NiftiReviewFile.jsx:271](../src/features/nifti-review/NiftiReviewFile.jsx#L271)).

## 6. Limitations and known gaps

- **Unrecoverable files can still hang the spinner.** If recovery re-throws
  (no readable header), or the fetch fails for another reason,
  `dataFetchStateMap` is still left at `fetching`. This is the original
  loader's behaviour and is unchanged.
- **Only the first volume of a 4D file is displayed.** The loader has always
  done this, since `createImage` slices frames from the start of the data. So
  for a DWI file, the image can look complete while `recoveredFraction` is
  well below 100%, because the missing data sits in later volumes.
- **Memory for damaged files.** Decoded chunks and the padded buffer briefly
  exist side by side, about 2× the decompressed size. Healthy files aren't
  affected.
- **Transitive dependency.** The patch imports `Gunzip` from `fflate`, which
  `nifti-volume-loader` doesn't declare itself. It resolves to the hoisted
  `node_modules/fflate` (0.7.3), which `nifti-reader-js` depends on. If an
  upgrade stops hoisting it, the import breaks at build time rather than
  silently.
- **Not yet verified in the running app on a real damaged file.** So far it
  has been checked with lint, a production build, and fflate's behaviour on
  synthetic truncated data.

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
- If the loader is upgraded upstream, re-check that `fetchAndProcessNiftiData`
  still calls `NiftiReader.decompress`, the single call site this change
  replaces.

# Image Loading and Navigation — Implementation Notes

How the viewer shows image loading progress and keeps navigation between exams
fast. The loading indicator shows a percentage, sits over the viewer on every
page, and covers stack exams, which now download all their frames in the
background. Leaving an exam mid-load pauses its download until the curator
comes back to it. On the NIfTI review page, a refresh keeps the curator's place
in the list.

**Audience:** developers touching image loading, the loading indicator, or
next/previous navigation on any review route.

**Branch:** `image-navigation-fix-develop`, on top of `large-nifti-fix-develop`
([large-nifti-fix.md](large-nifti-fix.md)).

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/loadingProgress.js](../src/lib/loadingProgress.js) | Hands out progress reporters; only the newest load reaches the indicator |
| [src/features/optionSlice.js](../src/features/optionSlice.js) | `loadingProgress` state, cleared whenever `loading` changes |
| [src/components/LoadingSpinner.jsx](../src/components/LoadingSpinner.jsx) | The ring with the percentage inside; `LoadingPage` for route fallbacks |
| [src/components/LoadingOverlay.jsx](../src/components/LoadingOverlay.jsx) | Puts the indicator over the viewer panel, or over the window when a page has none |
| [src/components/RouteLayout.jsx](../src/components/RouteLayout.jsx) | Mounts `ViewerLoadingIndicator` in the middle panel |
| [src/utilities.js](../src/utilities.js) | Frame progress in `startVolumeLoad`, `streamStackImages`, and resuming an exam's downloads in `makeRoomForExam` / `makeRoomForStackExam` |
| [src/lib/examDownloads.js](../src/lib/examDownloads.js) | Queue for DICOM file requests: throttles, pauses and resumes them per exam; lifts Cornerstone's pool cap |
| [src/components/EnableCornerstone.jsx](../src/components/EnableCornerstone.jsx) | Installs the queue (the DICOM loader's `open` option) and lifts the pool cap at startup |
| [src/features/dicom-review/DicomReviewIEC.jsx](../src/features/dicom-review/DicomReviewIEC.jsx), [src/features/mask-review/MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx) | Stream stack frames; pause the exam's downloads on leave |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Pauses the exam's downloads on leave |
| [src/features/nifti-review/niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js) | Turns NIfTI download progress into a percentage |
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx) | Reports the NIfTI download; pauses and resumes the file |
| [src/features/nifti-review/niftiReviewOrder.js](../src/features/nifti-review/niftiReviewOrder.js), [src/routes/nifti/RouteNiftiReviewVR.jsx](../src/routes/nifti/RouteNiftiReviewVR.jsx) | Keep the review order across page refreshes |
| [patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch](../patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch) | NIfTI loader: decoded-byte progress, and pausing and resuming a file's download |

---

## 1. What curators see

- **A percentage inside the loading ring**, which is bigger to fit it:
  - volume exams: slices loaded;
  - stack exams: frames loaded;
  - NIfTI files: how much of the file has been read.
- **The indicator sits in the middle of the viewer panel** on every review
  page, and never blocks clicks. Before a page's layout exists (e.g. while a
  review list loads) it sits in the middle of the window. A route's brief
  loading fallback shows the same indicator, centred, without a percentage.
- **Stack exams stream.** Every frame downloads in the background, the frame
  on screen first, and the indicator stays up until the last one is in.
- **Leaving an exam mid-load pauses its download** (next, previous, or another
  page). Going back to it resumes where it stopped, percentage included.
- **NIfTI review keeps its order across a refresh**, so Previous still works.

## 2. The loading percentage

### 2.1 State and reporters

`options.loadingProgress` holds a whole-number percentage, or null when
unknown. `setLoading` clears it, so a new load never shows the last one's
number.

`resetOptions` leaves `loading` and `loadingProgress` alone: they belong to
the load in progress. The single-exam routes reset options in their own
effect, which runs after the viewer's load effect has raised the indicator,
so resetting them there hid the indicator for the whole load.

A load gets a reporter from `startLoadingProgress()` and calls it with
percentages. Only the newest reporter reaches the store, and
`lib/loadingProgress.js` subscribes to the store to silence every reporter
when `loading` changes. The
reason: a volume abandoned by navigation keeps streaming in the background and
would otherwise drive the next exam's indicator. So a load must create its
reporter **after** its `setLoading(true)`.

### 2.2 Where the numbers come from

- **Volumes:** `startVolumeLoad(volume, onLoaded, { reportProgress })` watches
  `IMAGE_VOLUME_MODIFIED` for the volume and reports `framesProcessed` out of
  `imageIds.length`. It reports the current count at once, so a revisit to a
  half-loaded volume starts from there.
- **NIfTI:** `NiftiReviewFile` passes `reportProgress: false` (in a 4D file
  every frame is in long before the file has been read) and reports the file
  instead (`watchNiftiDownloadProgress`). The loader's progress event now
  carries `decoded` and `decodedTotal` (the size the header declares), because
  the file server may send no `Content-Length`. Downloaded bytes are only a
  fallback until the header is in.
- **Stacks:** `streamStackImages` counts the frames that have loaded or
  failed.

## 3. Where the indicator sits

`LoadingOverlay` wraps the router and provides a context.
`ViewerLoadingIndicator`, which `RouteLayout` renders inside `#middle-panel`,
registers itself through it. While any is registered, the full-window overlay
stays hidden.

The middle panel is a grid whose last row is the operations bar, and whose
row before it is the viewer, with or without a filter bar above. So
`grid-row: -3 / -2` is the viewer area on every page. The indicator is
absolutely positioned there (`#middle-panel` is `position: relative`), which
makes that grid area its box without taking a cell from the viewer.

The spinner can now render in several places at once, so it is styled by class
rather than id. The router's `HydrateFallback` is `LoadingPage`, the spinner
centred in the page.

## 4. Stack exams stream

Before, the stack viewport loaded only the frame on screen, and the pages took
the spinner down as soon as the viewer mounted. Each frame scrolled to then
downloaded on demand, with no indicator.

`streamStackImages(imageIds)` downloads the frame `setStack` shows (the
first) on its own, then requests the rest through `loadAndCacheImages`, in
stack order. The first frame goes alone because downloads in flight split the
bandwidth evenly: requested with the rest, it arrived no sooner than the seven
after it, so on a slow link a small stack showed nothing until all of it was
in (Fast 3G, 512 KB frames: about 24 s before, 4 s now). It reports the
share of frames settled, and resolves, never rejects, once all have loaded or
failed. DICOM review and mask review call it right
after `makeRoomForStackExam` and take the spinner down when it resolves
(stale-checked). Masking's `loadStackSegmentation` already downloaded the
whole stack and now uses it too.

## 5. NIfTI review order across refreshes

Next and previous walk the list from `/papi/v1/nifti/visualreview/:vr`, which
is fetched once per page load. The server's list changes as files are graded
(after a refresh it started at the current file), so Previous had nowhere to
go.

`rememberReviewOrder(vr, files)` keeps the order in `sessionStorage`
(`mirabelle.niftiReviewOrder.<vr>`), which survives a refresh but not a new
tab. Files the server lists that aren't remembered yet are appended in its
order. If storage is unavailable, it logs a warning and uses the server's
order.

## 6. Pausing an exam's downloads

### 6.1 DICOM: a request queue

Cornerstone requests every frame of an exam at once, and the DICOM loader's
requests (`wadouri`) can't be cancelled once sent. So leaving an exam mid-load
left the rest of its download queued in the browser, ahead of the next exam's.

`openDicomRequest` is the DICOM loader's `open` option. It opens the XHR as
the default does, then replaces that request's `send`, so the request is sent
from a queue instead:

- at most `MAX_IN_FLIGHT` (8) are in flight, oldest first: a couple more than
  a browser's six HTTP/1.1 connections per host;
- `focusExamDownloads(imageIds)` records the exam's file URLs and makes it the
  exam on screen. Requests for any other recorded exam wait unsent, unless the
  exam on screen uses the same file;
- `pauseExamDownloads()` means no exam is on screen: every recorded exam's
  unsent requests wait.

`makeRoomForExam` and `makeRoomForStackExam` call `focusExamDownloads`, since
every exam load calls one of them before its first image request. The load
effects of DICOM review, masking and mask review call `pauseExamDownloads` in
their cleanup.

While paused, an exam's frames simply stay pending. Its Cornerstone volume
stays "loading", and when the exam is loaded again its requests are released
and `startVolumeLoad` completes through `IMAGE_VOLUME_LOADING_COMPLETED`.

### 6.2 Cornerstone's pool cap

`imageLoadPoolManager` counts every pending frame as a busy slot, up to 1000
per request type. A paused exam's frames stay pending, so a few exams left
mid-load filled the pool, and the exam on screen stuck at 0% without starting
a single frame. `uncapImageLoadPool()` sets the pool's caps to `Infinity` at
startup. The queue above throttles the network instead.

### 6.3 NIfTI: cancel the fetch, resume with a Range request

The patched loader exports `pauseNiftiFileLoad(url)` and
`resumeNiftiFileLoad(url)`. `NiftiReviewFile` resumes its file when it loads,
and pauses it in its cleanup. Details are in
[truncated-nifti-recovery.md §4.6](truncated-nifti-recovery.md):

- pausing cancels the fetch but keeps the decoder, the collected first volume,
  and every waiting frame;
- resuming asks for `Range: bytes=<bytes read>-`. A 200 instead of a 206
  means the server sent the whole file again, and the bytes already read are
  skipped. A 416 means nothing was left;
- a server that compresses responses on the fly (`Content-Encoding`) is never
  sent a Range header, since its ranges would count compressed bytes;
- a resumed read waits for the paused one to unwind, so two never overlap.

## 7. Limitations and known gaps

- **After leaving an exam, up to 8 of its frames still finish** ahead of the
  next exam's, because they were already sent. That is typically under a
  second.
- **A stack frame scrolled to before it has downloaded waits its turn** in the
  queue rather than jumping ahead. After the first frame, the rest arrive in
  batches of up to `MAX_IN_FLIGHT` that finish together on a slow link.
- **`MAX_IN_FLIGHT` suits HTTP/1.1**, which the server uses. Raise it if the
  server moves to HTTP/2.
- **A multi-frame DICOM stored as one file** downloads in one piece, so its
  percentage goes from 0 straight to 100.
- **The queue records every exam visited in the session** (a few thousand URL
  strings each), and requests held for an exam since evicted from the cache
  stay queued, unsent. Both are small.
- **The review order is per browser tab**, and starts being remembered on the
  first page load after this change.
- **Grading isn't blocked while the indicator is up.**
- **Verification:** each commit was checked with ESLint and a production
  build. Pausing was exercised in the running app during development, which is
  how the pool-cap stall (§6.2) was found and fixed. The author didn't open
  production files (PHI).

## 8. Maintaining

- **Every image request for an exam must come after its `makeRoomForExam` /
  `makeRoomForStackExam` call.** A request for an exam visited earlier would
  otherwise wait in the queue, and the load awaiting it would hang.
- **Don't put a cap back on `imageLoadPoolManager`** (§6.2).
- **The DICOM loader's `open` option belongs to `lib/examDownloads.js`.** If
  another feature needs it, compose with `openDicomRequest` rather than
  replacing it.
- **After pulling a patch change, restart the dev server.** Webpack won't pick
  up patched `node_modules` files during a live reload.

# Image Loading and Navigation — Implementation Notes

How the viewer shows image loading progress and keeps navigation between exams
fast. The loading indicator shows a percentage, sits over the viewer on every
page, and covers stack exams, which now download all their frames in the
background and draw each frame as its file arrives. Leaving an exam mid-load
pauses its download until the curator comes back to it. On the NIfTI review
page, a refresh keeps the curator's place in the list.

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
| [src/lib/dicomFileStreams.js](../src/lib/dicomFileStreams.js) | Streams a stack exam's files, so their bytes can be read as they arrive; counts the share of the frames in so far |
| [src/lib/stackFramePreview.js](../src/lib/stackFramePreview.js) | Draws a stack frame over the viewport while its file arrives |
| [src/components/StackViewport.jsx](../src/components/StackViewport.jsx) | Attaches the frame preview to the stack viewport |
| [src/components/EnableCornerstone.jsx](../src/components/EnableCornerstone.jsx) | Installs the queue (the DICOM loader's `open` option) and lifts the pool cap at startup |
| [src/features/dicom-review/DicomReviewIEC.jsx](../src/features/dicom-review/DicomReviewIEC.jsx), [src/features/mask-review/MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx) | Stream stack frames; pause the exam's downloads on leave |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Pauses the exam's downloads on leave |
| [src/features/nifti-review/niftiFileRead.js](../src/features/nifti-review/niftiFileRead.js) | Turns NIfTI download progress into a percentage |
| [src/features/nifti-review/NiftiReviewFile.jsx](../src/features/nifti-review/NiftiReviewFile.jsx) | Reports the NIfTI download; pauses and resumes the file |
| [src/features/nifti-review/niftiReviewOrder.js](../src/features/nifti-review/niftiReviewOrder.js), [src/routes/nifti/RouteNiftiReviewVR.jsx](../src/routes/nifti/RouteNiftiReviewVR.jsx) | Keep the review order across page refreshes |
| [src/features/nifti-review/niftiLoadingWindow.js](../src/features/nifti-review/niftiLoadingWindow.js) | Windows a NIfTI volume as its slices arrive, so it draws from the first slice |
| [patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch](../patches/@cornerstonejs+nifti-volume-loader+3.33.4.patch) | NIfTI loader: decoded-byte progress, and pausing and resuming a file's download |

---

## 1. What curators see

- **A percentage inside the loading ring**, which is bigger to fit it:
  - volume exams: slices loaded;
  - stack exams: frames loaded, counting the part of each file in so far;
  - NIfTI files: how much of the file has been read.
- **A NIfTI volume draws from its first slices**, instead of once half of it
  has downloaded. Its window follows the slices received until the middle one
  is in, then settles on the usual one. Going back to one already loaded
  shows it without asking the server for the file again.
- **A stack frame draws in as its file arrives**, row by row from the top,
  where the frame will appear, for the frame on screen, including one
  scrolled to before it has downloaded.
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
first) on its own, then requests the rest, in stack order. The first frame
goes alone because downloads in flight split the bandwidth evenly: requested
with the rest, it arrived no sooner than the seven after it, so on a slow link
a small stack showed nothing until all of it was in (Fast 3G, 512 KB frames:
about 24 s before, 4 s now). It resolves, never rejects, once all have loaded
or failed. DICOM review and mask review call it right after
`makeRoomForStackExam` and take the spinner down when it resolves
(stale-checked). Masking's `loadStackSegmentation` already downloaded the
whole stack and now uses it too.

### 4.1 Drawing a frame as it arrives

Cornerstone can only show a frame once its whole file is in, so a large file
used to leave the viewer empty until the last byte (a 2048×2048 frame on Fast
3G: 49 s). Now the curator sees the frame arrive, top to bottom.

**Streaming the files.** The DICOM loader downloads a file with one XHR
(`responseType: arraybuffer`) and sees none of it until the end. So before
each frame's `loadAndCacheImage`, `streamStackImages` calls `streamDicomFile`
(`lib/dicomFileStreams.js`). That starts the file's download through the
loader's dataset cache (`wadouri.dataSetCacheManager.load`) with its own
`loadRequest`: a `fetch` whose body is read chunk by chunk, sent from the same
queue as the loader's requests (`queueDownload`, §6.1). The dataset cache
shares one download per URL, so the image load that follows joins it and gets
the whole file at the end, as before. The extra hold `streamDicomFile` takes
on the dataset is dropped once the file is in, so the dataset is still freed
with its images. `watchDicomFile(url, listener)` reports the bytes received so
far.

**The preview.** `attachFramePreview` (`lib/stackFramePreview.js`), which
`StackViewport` attaches before `setStack`, puts a canvas over the viewport.
When the viewport asks for a frame (`PRE_STACK_NEW_IMAGE`), it watches that
frame's file. Once the header is in, it reads the layout with
`dicom-parser` (`untilTag` stops at the pixel data), then every 150 ms paints
the rows received so far, over black. It goes once Cornerstone has shown and
drawn the real frame (`STACK_NEW_IMAGE`, then `IMAGE_RENDERED`), or when the
viewport asks for another frame.

- **Shading:** the header's rescale and first window, as the viewport opens
  with; without a window, the range of the values so far. Once a frame is on
  screen, the viewport's own window and invert, which the curator may have
  changed. MONOCHROME1 is inverted; 8-bit RGB is drawn as is.
- **Placement:** with a frame of the same size on screen, the preview takes
  its place, whatever the zoom, pan or rotation (`worldToCanvas`). For the
  first frame, it works out where Cornerstone will put it: `resetCamera` fits
  the pixel centres with a margin of `insetImageMultiplier` and centres pixel
  `floor(size / 2)`, then the viewer zooms to `MARGIN_ZOOM`.
- **What can be drawn:** uncompressed little-endian pixel data (implicit or
  explicit VR), 8 or 16-bit grayscale, or 8-bit RGB with its samples
  together. Anything else draws nothing, and appears once loaded, as before.

**The percentage.** `trackFramesArrived` counts a settled frame as 1, and a
frame still downloading as the share of its file received, when the server
sent `Content-Length`. So it moves while a large file arrives, instead of
waiting at 0% for the whole file.

## 5. NIfTI review

### 5.1 The review order across refreshes

Next and previous walk the list from `/papi/v1/nifti/visualreview/:vr`, which
is fetched once per page load. The server's list changes as files are graded
(after a refresh it started at the current file), so Previous had nowhere to
go.

`rememberReviewOrder(vr, files)` keeps the order in `sessionStorage`
(`mirabelle.niftiReviewOrder.<vr>`), which survives a refresh but not a new
tab. Files the server lists that aren't remembered yet are appended in its
order. If storage is unavailable, it logs a warning and uses the server's
order.

### 5.2 Drawing from the first slices

Cornerstone sets a volume's window before it draws the volume at all
(`setDefaultVolumeVOI`, awaited by `createVolumeActor`): from the window in
the middle image's metadata (`voiLutModule`) if there is one, otherwise from
the middle slice's range, which it loads and waits for. A NIfTI file has no
window, and streams its slices in order, so no pane drew anything until half
of the first volume had downloaded (a 60-slice file on Fast 3G: slices from
5 s, first drawing at 27 s).

`windowNiftiWhileLoading(imageIds, volumeId)`
(`features/nifti-review/niftiLoadingWindow.js`), which `NiftiReviewFile` calls
once the image ids exist and before the viewer mounts, puts a window in the
middle image's metadata, so Cornerstone draws straight away:

- a placeholder (`0..1`) until a slice is in;
- then the range of the slices received so far (`IMAGE_LOADED`), on the 2D
  viewports and in the metadata, at most every 300 ms;
- once the middle slice is in, its range: the window Cornerstone would have
  picked, so the loaded view looks as it did before. That window stays in the
  metadata, so a revisit starts with it.

A viewport whose window isn't one this set has been windowed by the curator,
and from then on the window is left alone. The 3D pane uses presets and isn't
touched. The same 60-slice file now draws from 5 s in all three 2D panes.

### 5.3 Going back to a loaded file

`createNiftiImageIdsAndCacheMetadata` reads the header by downloading the
start of the file, and `NiftiReviewFile` called it on every visit. So going
back to a file already loaded waited on the server to start sending the file
again, just for its header, although the volume was cached. Now, when the
file's volume is cached, `NiftiReviewFile` reuses its image ids, whose
metadata is still registered from the first visit, and makes no file request.
A paused download still resumes (§6.3).

With a 1.5 s server delay, a revisit drew at 1.54 s before and 0.05 s now. On
Fast 3G it draws at 0.6 s, the round trip of the details request, which the
page still waits for.

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

Stack files streamed by `lib/dicomFileStreams.js` (§4.1) are fetches rather
than the loader's XHRs. They wait in the same queue through
`queueDownload(url, download)`, which starts `download` when the queue would
send an XHR for `url`.

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
- **A multi-frame DICOM stored as one file** downloads in one piece. Its
  first frame draws in as the file starts, but a frame further in draws only
  once the file has reached it, and none can be shown by Cornerstone until
  the whole file is in.
- **Compressed stack frames (JPEG, JPEG 2000, RLE and the like) don't draw
  as they arrive**; they appear once loaded. So do big-endian and deflated
  files, palette colour, YBR and planar RGB.
- **Without a `Content-Length`**, the stack percentage counts whole frames
  only, as before.
- **The loading ring sits over the middle of the viewer**, so it covers the
  centre of a frame drawing in beneath it.
- **The first frame's placement copies Cornerstone's `resetCamera`** (§4.1).
  A frame with no frame of its size on screen yet (e.g. a different size
  later in the stack) is placed that way too, which ignores any zoom or pan.
- **The NIfTI axial pane still waits for the middle slice**, the one it opens
  on, so it stays blank until half of the first volume is in. The sagittal
  and coronal panes draw from the first slice.
- **A NIfTI window changes while slices arrive** (§5.2), getting darker as
  brighter slices come in, then settles on the middle slice's range.
- **A NIfTI file is requested twice on its first visit.** To read the
  header, the loader requests the whole file, cancels once the header is in,
  then requests it again, so the first slice waits on the server twice.
  Reading the header from the one download that carries the slices needs a
  change to the loader patch. Revisits make no file request (§5.3).
- **A NIfTI revisit waits for the file's details** (one API round trip)
  before showing the cached volume.
- **The queue records every exam visited in the session** (a few thousand URL
  strings each), and requests held for an exam since evicted from the cache
  stay queued, unsent. Both are small.
- **The review order is per browser tab**, and starts being remembered on the
  first page load after this change.
- **Grading isn't blocked while the indicator is up.**
- **Verification:** each commit was checked with ESLint and a production
  build. Pausing was exercised in the running app during development, which is
  how the pool-cap stall (§6.2) was found and fixed. The author didn't open
  production files (PHI). Stack streaming and the frame preview (§4, §4.1)
  were run in headless Chrome under DevTools "Fast 3G" with the cache off,
  against a mock backend serving synthetic CT frames: 20 single-frame files,
  one 2048×2048 frame, one 10-frame file, a frame scrolled to mid-download,
  and a volume exam through the reworked queue. The preview's last draw and
  the real frame covered the same canvas rectangle each time. NIfTI drawing
  (§5.2) was run the same way on a synthetic 256×256×60 file, with a 1.5 s
  server delay before each file: all three 2D panes redrew as slices arrived,
  the window became the middle slice's range once it was in, and a window set
  mid-load was kept to the end. Revisits (§5.3) were timed moving between two
  such files, with and without Fast 3G, including going back to a file left
  mid-download, whose download resumed with a Range request.

## 8. Maintaining

- **Every image request for an exam must come after its `makeRoomForExam` /
  `makeRoomForStackExam` call.** A request for an exam visited earlier would
  otherwise wait in the queue, and the load awaiting it would hang.
- **Don't put a cap back on `imageLoadPoolManager`** (§6.2).
- **The DICOM loader's `open` option belongs to `lib/examDownloads.js`.** If
  another feature needs it, compose with `openDicomRequest` rather than
  replacing it.
- **Stack streaming relies on two things in the DICOM loader**
  (`wadouri.dataSetCacheManager`): a download already under way for a URL is
  shared by later loads of it, whatever `loadRequest` they pass; and each
  `load` holds the dataset until a matching `unload`. After a Cornerstone
  upgrade, check both, or stack frames may download twice or never be freed.
- **The first frame's placement mirrors `Viewport.resetCamera`** and the
  viewer's `MARGIN_ZOOM` (§4.1). If either changes, the first preview will be
  off. The harness check is to compare its last draw with the real frame's
  corners from `worldToCanvas`.
- **NIfTI drawing early relies on `setDefaultVolumeVOI`** taking the window
  from the middle image's `voiLutModule` before it would load the middle
  slice, and needing a non-zero `windowCenter` to do so (§5.2). After a
  Cornerstone upgrade, check that a NIfTI volume still draws from its first
  slice.
- **After pulling a patch change, restart the dev server.** Webpack won't pick
  up patched `node_modules` files during a live reload.

# Exam Cache Management — Implementation Notes

How Mirabelle keeps a bounded amount of image data in memory while letting the
curator move between exams quickly. Two halves: an **exam-level LRU** that
decides what to evict and when, and a **header indicator** that shows how full
the cache is.

**Audience:** developers working on any route that loads images. Ported to this
branch from `iec-list`.

**Modules:**

| File | Responsibility |
|---|---|
| [src/utilities.js](../src/utilities.js) | The eviction engine: visit tracking, size estimation, `makeRoomForExam` / `makeRoomForStackExam`, `decacheVolume`, `startVolumeLoad`, the load-generation guard |
| [src/lib/cacheSizing.js](../src/lib/cacheSizing.js) | Picks the cache's maximum size at startup, from device memory or a localStorage override |
| [src/components/CacheStatus.jsx](../src/components/CacheStatus.jsx) | The header's used / max readout and utilization bar |
| [src/components/EnableCornerstone.jsx](../src/components/EnableCornerstone.jsx) | Calls `configureCacheSize()` before any load can run |
| [src/features/mask/MaskIEC.jsx](../src/features/mask/MaskIEC.jsx) | Frees the labelmap on teardown and on Clear; the Reload Image recovery path |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) | Survives a volume evicted mid-setup |
| [src/lib/installGlobalErrorHandlers.js](../src/lib/installGlobalErrorHandlers.js) | Turns uncatchable image-download rejections into one toast |
| [webpack.config.js](../webpack.config.js) | Dev-proxy connection pooling; browser disk-cache headers on `/files` |

---

## 1. Why the app evicts instead of Cornerstone

Cornerstone's image cache is a fixed byte budget with its own eviction. That
eviction never runs for us, because the app loads `wadouri:` imageIds and that
loader marks each image with a `sharedCacheKey` — pinning it. Once pinned bytes
fill the cache every subsequent load throws `CACHE_SIZE_EXCEEDED`, and nothing
in the library recovers from it.

The cache also doesn't understand the app's unit of work. An exam is not one
image: it is a source volume plus a derived labelmap, or a set of pinned stack
slices. Evicting half of one is worse than evicting none.

So eviction is done here, at whole-exam granularity, before each load. Exams
already visited are deliberately kept — instant back-navigation is the point —
and are dropped only when the incoming exam needs the room.

## 2. The eviction engine

All in [utilities.js](../src/utilities.js), under `— Exam cache management —`.

**Two registries.** `examLastVisited` maps an exam key to the timestamp of its
last visit; it establishes LRU order. `stackExamImageIds` maps a stack exam's
key to the imageIds cached for it — stack slices belong to no volume, so
without this registry there is no handle by which to free them.

Volume exams are keyed by `volumeId`. Stack exams are keyed by their first
imageId, which is stable across visits — unlike the `segmentationId`, which is
randomised per visit.

**Estimating the need.** `estimateExamBytes` sizes the incoming exam: source
slices (skipped when a previous visit already cached them) plus one Uint8
labelmap of the same dimensions, times a 1.1 margin for per-image overhead.
Frame geometry comes from already-parsed DICOM metadata; a fresh exam has none,
so it falls back to a 512×512×16-bit frame. Over-reserving is the safe
direction — the cost is one extra old exam evicted.

**Making room.** `makeRoom` returns immediately if
`cache.getBytesAvailable()` already covers the need. Otherwise it walks
`listEvictableExams` — least-recently-visited first — evicting whole exams
until it does. If even a full sweep isn't enough, it proceeds and lets
Cornerstone report the failure: that exam is too large for the cache on its own.

`listEvictableExams` skips the keys the caller pins (the exam being loaded), and
skips derived labelmaps whose parent volume is still cached — those are freed
with their parent, in `evictExam`, rather than on their own.

**Entry points.** `makeRoomForExam(imageIds, keepVolumeIds)` and
`makeRoomForStackExam(imageIds)` both record the visit and then make room. They
run at the top of every load path: `loadVolumeAndSegmentation`, `loadVolume`,
and `loadStackSegmentation` in utilities.js, plus the two routes that build a
volume directly rather than through those helpers
([MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx)) or that
render a stack the viewport streams on demand
([DicomReviewIEC.jsx](../src/features/dicom-review/DicomReviewIEC.jsx)).

### 2.1 Freeing a volume completely

`decacheVolume` exists because neither library call frees everything:
`removeSegmentation` / `removeAllSegmentations` drop tool state only, and
`cache.removeVolumeLoadObject` unpins the backing images but leaves them counted
against the limit. So it removes the volume first — releasing the pin — then
force-removes each backing image.

Without it, every visit to a mask exam and every press of Clear leaked a
full-size labelmap volume. It is called at three points in
[MaskIEC.jsx](../src/features/mask/MaskIEC.jsx): the load effect's teardown, the
Clear button, and Reload Image.

### 2.2 Guarding against evictions that land mid-flight

Eviction and fast navigation together create races that used to surface as
unhandled rejections or a silently wrong segmentation:

- **Stale loads.** `examLoadGeneration` is a monotonic token taken at the start
  of each load. Anything resuming with a token that is no longer current
  belongs to an abandoned exam and returns without touching state — otherwise
  it would stomp the current exam's segmentation, or throw because its own
  volume was evicted while it was in flight.

  This is checked twice in `loadVolumeAndSegmentation`, and both matter.
  The obvious one is the load-completion callback. The subtle one is
  immediately after `createAndCacheVolume`: that await is wide, not a
  microtask — for `wadouri:` the streaming loader downloads three frames
  before resolving — and everything after it (`removeAllSegmentations`, the
  labelmap, `MaskSegmentationReady`) mutates *global* segmentation state. A
  curator who moves to a fresh exam and straight back to a cached one gets the
  cached exam installed synchronously; without the second check the first
  exam's load then resumes and deletes the segmentation of the exam actually
  on screen, leaving the scissors with nothing to draw into.

  The volume path also re-checks that its volume is still cached before
  proceeding, and each route re-checks its own request id after every await
  and in its catch — a load abandoned by navigation may fail against
  torn-down state or a cache reservation the live exam has since taken, and
  that must not flag the exam on screen as errored.
- **Unresolved cache entries.** `cache.filterVolumesByReferenceId` reads
  `referencedVolumeId` off every entry unguarded; entries whose load promise
  hasn't settled are `undefined`, so during fast navigation it threw and failed
  the incoming load. `evictExam` and `listEvictableExams` use a guarded
  `getVolumes().filter(...)` instead.
- **Viewport setup.** `viewport.setVolumes` is awaited inside
  [VolumeViewport.jsx](../src/components/VolumeViewport.jsx)'s `setup`, with a
  `cancelled` flag checked after each await and a `.catch` that swallows the
  failure only when the viewport was torn down mid-setup. Fire-and-forget put
  the rejection outside the setup's reach, where an evicted volume became an
  unhandled `imageVolume ... does not exist`.
- **View-mode toggles.** The same file's `viewMode` effect reads
  `volume.dimensions`, so it now bails when the volume is absent: eviction
  means a mounted viewport's volume can disappear from under it, which was
  impossible before this system existed.

### 2.3 Joining a load already in progress

`volume.load(cb)` does not register the callback when the volume is already
mid-stream from an earlier visit — a common case when navigating back and forth
— which stranded whatever was waiting on it. `startVolumeLoad` also listens for
`IMAGE_VOLUME_LOADING_COMPLETED`, fires its callback exactly once from whichever
path arrives first, and returns a cancel function.

### 2.4 Frames that fail to download

A single 504'd frame leaves no metadata for that slice, and anything that reads
per-frame geometry across the whole volume then throws — historically taking
the exam's labelmap with it. `backfillMissingFrameMetadata` clones the nearest
loaded frame's modules onto the failed ones. The substitution is safe because
the labelmap's geometry comes from the volume itself; the failed slice simply
stays black.

If preparation fails anyway, the load path reports it as a toast and fires
`VolumeLoadFailed`, so consumers gated on `VolumeReallyLoaded` can tell a dead
load from a slow one.

Rejections from the image loader can't be caught by any caller — they surface as
`{error: XMLHttpRequest}` from inside the loader — so
[installGlobalErrorHandlers.js](../src/lib/installGlobalErrorHandlers.js)
classifies them and reports them under a single dedupe key. A flaky exam fails
many frames at once and must still produce one toast, not dozens.

**Recovery.** Failed downloads are never cached, so dropping the exam and
loading it again genuinely retries the missing slices. That is Reload Image —
offered in the details panel and on the placeholder shown after a failed load.

## 3. How big the cache is

[cacheSizing.js](../src/lib/cacheSizing.js) runs once, from
`EnableCornerstone` before any load:

1. `localStorage["mirabelle.cacheGB"]` wins if present and within 0.5–32 GB.
2. Otherwise `navigator.deviceMemory / 2`, clamped to 0.5–4 GB. The API is
   Chrome/Edge only and the browser caps its report at 8, so a 64 GB
   workstation reports 8 and gets 4.
3. Where the API is missing (Firefox, Safari), Cornerstone's 3 GB default stands.

Rough capacity, using the module's own frame model: a ~300-slice CT is ~150 MB
of source plus ~75 MB of labelmap, so ~250 MB per masked exam. A 4 GB cache
holds roughly 16, the 3 GB default roughly 12, the 0.5 GB floor about 2 before
eviction starts.

Sizing and accounting are CPU-RAM only. Volumes also occupy GPU textures, which
nothing here measures.

## 4. The header indicator

[CacheStatus.jsx](../src/components/CacheStatus.jsx) shows `Cache X.X / Y.Y GB`
with a 1px utilization bar — green to 75%, amber past it, red past 90% — and
renders nothing until Cornerstone has initialised. It is mounted in
[Header.jsx](../src/components/Header.jsx), which renders once for the whole
app, so it persists across routes.

It polls twice a second rather than subscribing: per-image cache events fire
thousands of times while a volume streams, and reading two counters is far
cheaper than filtering that. The state object is kept identical when neither
counter changed, so an idle app doesn't re-render its header every tick.

## 5. The dev proxy (development only)

Production serves files through nginx; this affects `webpack serve` only.

The proxy uses an explicit keep-alive agent so the hundreds of frame requests in
one exam load reuse backend connections instead of paying a handshake each. The
pool is sized 64 with a 120 s `timeout` and `proxyTimeout`, because http-proxy
strands an upstream socket whenever the browser aborts an in-flight request —
which Cornerstone does constantly during navigation. With a small pool and no
timeouts those sockets accumulate until every proxied request hangs, for every
browser, until the dev server is restarted.

`/files` is a separate entry from `/papi` so its responses can carry
`cache-control: public, max-age=604800, immutable`. Those paths are
content-addressed, so re-downloading an exam the LRU evicted can be served from
the browser's disk cache instead of the network. API responses under `/papi`
change and are deliberately left uncached.

## 6. Known gaps

- **Load concurrency is untuned.** `maxWebWorkers` is still hardcoded to 5, as
  is Cornerstone's default prefetch pool. Scaling these to `hardwareConcurrency`
  lives on the unmerged `general-improvements` branch (`8d01850`).
- **A cache-full failure is generic.** When a full eviction sweep can't free
  enough, the user gets the generic error toast with no mention of the cache or
  the size override. An exam larger than a 0.5 GB floor cache fails this way
  every time.
- **Sizing is coarse off Chrome.** Firefox and Safari sit at 3 GB regardless of
  actual RAM, and the `mirabelle.cacheGB` override is not surfaced in the UI.
- **No GPU accounting**, and no per-exam breakdown or eviction feedback in the
  header — the bar changing colour is the only warning before eviction begins.

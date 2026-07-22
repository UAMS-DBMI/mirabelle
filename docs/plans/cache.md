# Cache — Cornerstone cache, volume loading, memory

Component area: the Cornerstone3D image cache (fixed-size, default 3 GB),
app-level exam eviction, load concurrency, and the memory-usage UI.

Where the code lives (all verified by `git log -S` / `--follow`):

| Segment | Commits | What it added |
| --- | --- | --- |
| masking-improvements | `e5e9bfd` "Improved vr navigation" | All three foundations in one commit: `src/lib/cacheSizing.js`, `src/components/CacheStatus.jsx`, and the entire eviction machinery in `src/utilities.js` (`makeRoomForExam`, `decacheVolume`, `examLoadGeneration`, `startVolumeLoad`, `backfillMissingFrameMetadata`) |
| ui-loading-improvements | `ed479ef`, `dccd81a` | Eviction crash guard; dev-server proxy fix |
| iec-list | `e98688f`, `d585e74` | `src/lib/iecQueueData.js` (size estimates), `src/lib/loadedExams.js` (what's-in-cache tracking) |
| **origin/general-improvements (UNMERGED)** | `8d01850` | Load concurrency tuning in `EnableCornerstone.jsx` — **not on the shipping branch** |

---

## Task: "Cache loading issues are resolved"

**Status: core implemented; realistically partial.** The LRU eviction engine,
leak fixes, and fast-navigation crash fixes are merged on `iec-list`. Still
open: the concurrency tuning is stranded on `general-improvements`,
"single exam bigger than the cache" fails with only a generic toast, and
non-Chrome/low-RAM machines get coarse cache sizing.

### The problems and their fixes

Cornerstone's cache doesn't understand Mirabelle's unit of work (an exam =
source volume + derived labelmap + pinned stack slices). Before `e5e9bfd`
there was no app-level cache management at all.

1. **Cache accumulation across navigation → load failures.** Fixed by an
   **exam-level LRU** in `utilities.js`: `examLastVisited` timestamps each
   exam (utilities.js:376); `makeRoom(bytesNeeded, keepKeys)`
   (utilities.js:494) evicts least-recently-viewed whole exams until
   `getBytesAvailable() >= needed`. `makeRoomForExam` /
   `makeRoomForStackExam` run at the top of every load path
   (utilities.js:594, :746, :801; DicomReviewIEC.jsx:419,
   MaskReviewIEC.jsx:307). Bytes are estimated up front by
   `estimateExamBytes` (utilities.js:442): source slices + one Uint8
   labelmap, ×1.1 margin, 512×512×16-bit fallback geometry. Previously
   visited exams are deliberately kept until room is needed — instant
   back-navigation is the point of the design.
2. **Labelmap volume leak.** `removeSegmentation` only drops tool state; the
   labelmap volume stayed in the cache on every visit/clear. Fixed by
   `decacheVolume` (utilities.js:396-411) — removes the volume load object,
   then force-removes each backing image. Called at teardown
   (MaskIEC.jsx:531), Clear (MaskIEC.jsx:914), and Reload
   (MaskIEC.jsx:542-544).
3. **Stack slices never evictable** (pinned wadouri images belong to no
   volume). A side registry `stackExamImageIds` (utilities.js:380) records
   each stack exam's imageIds so `decacheStackExam` (utilities.js:414) can
   free them.
4. **`referencedVolumeId` crash during fast navigation (`ed479ef`).**
   `cache.filterVolumesByReferenceId` reads the property off every cache
   entry unguarded; entries whose load promise hasn't resolved are
   `undefined` → eviction threw → the incoming exam load failed. Replaced
   with a guarded `getVolumes().filter(v => v?.referencedVolumeId === key)`
   (utilities.js:478-488, same pattern in `listEvictableExams`).
5. **Stale async completions.** Abandoned loads' callbacks still fire and
   used to stomp the current exam's segmentation, or throw when the
   abandoned volume was LRU-evicted meanwhile. Guards: monotonic
   `examLoadGeneration` token captured per load (utilities.js:537, :590,
   :616-624), an existence re-check on the volume, route-level `isStale()`
   after every await (DicomReviewIEC.jsx:237), and `startVolumeLoad`
   (utilities.js:708) joining an already-mid-stream volume via
   `IMAGE_VOLUME_LOADING_COMPLETED` so a revisit doesn't strand the spinner.
6. **Unhandled rejection in viewport setup.** `viewport.setVolumes` is now
   awaited with a `cancelled` guard (VolumeViewport.jsx:233-243) so a volume
   evicted mid-setup is caught locally.
7. **Failed-frame metadata sinking the labelmap.** One 504'd frame left no
   metadata; building the labelmap reads `rows`/`columns` per frame →
   crash → exam un-maskable. `backfillMissingFrameMetadata`
   (utilities.js:548) clones the nearest loaded frame's modules onto failed
   frames; residual failure surfaces as a toast + `VolumeLoadFailed` event
   so the spinner drops (utilities.js:663-673).
8. **Global safety net.** `installGlobalErrorHandlers.js` routes escaped
   async errors to dedup'd toasts (image downloads →
   `messages.errors.framesFailed`, else `generic`).

### The dev-server proxy fix (`dccd81a`) — dev-only

Touches `webpack.config.js` `devServer.proxy` only; production is nginx
static files. Bug: the keep-alive proxy agent (added `e5e9bfd`) capped
upstream sockets at 16 with no timeouts; Cornerstone aborts requests
constantly during navigation, so http-proxy stranded sockets until the pool
wedged and **every** `/papi` and `/files` request hung for all browsers
until a dev-server restart. Fix: `maxSockets` 16→64, `timeout` +
`proxyTimeout` 120 s so stalled sockets are reaped. It's a
loading-reliability fix, but not about the Cornerstone cache and not
shipped to prod.

### How the cache is sized (`cacheSizing.js`, configured at startup)

`EnableCornerstone.jsx:43` calls `configureCacheSize()` before any loads:

- localStorage override `mirabelle.cacheGB` wins, clamped to 0.5–32 GB.
- Else `navigator.deviceMemory` (Chrome/Edge only, capped at 8 by the
  browser): `clamp(deviceMemory/2, 0.5, 4)` GB.
- Firefox/Safari: Cornerstone's 3 GB default stands.
- **No GPU/VRAM awareness anywhere** — sizing and accounting are CPU-RAM
  only, though volumes also live in GPU textures.
- `cacheSizing.js` never purges; all eviction lives in `utilities.js`. There
  are no `cache.purgeCache()` calls in src.

### `loadedExams.js` — read-only cache tracker (iec-list, `d585e74`)

Session registry of which exams' images are verifiably fully in cache, so
the IEC queue can flag "loaded" rows. `markExamLoaded` admits only fully
loaded probes (streaming volume `loadStatus.loaded`, or every stack frame
present — loadedExams.js:39-50, :133); `pruneLoadedExams` (:144) re-checks
against the live cache on every queue `loading`/`currentId` change so the
flag never lies after eviction. Sizes computed from geometry
(`x*y*z*bytesPerType`) because `volume.sizeInBytes` is NaN for image-backed
volumes (loadedExams.js:52-69). It never evicts anything itself.

### Sizing reality check (from the code's own math)

Default frame model 512×512×2 B ≈ 0.5 MB/slice. A ~300-slice CT ≈ ~150 MB
source + ~75 MB labelmap → **~250 MB per masked exam** (with the ×1.1
margin). So: 4 GB auto cache ≈ ~16 exams; 3 GB default ≈ ~12; the 0.5 GB
floor ≈ ~2 before LRU eviction starts.

### What remains unresolved

1. **Concurrency tuning unmerged.** `iec-list` still has
   `maxWebWorkers: 5` hardcoded and Cornerstone's default prefetch pool of
   5 (EnableCornerstone.jsx:36-39). `8d01850` (general-improvements) raises
   Prefetch to 20 and scales decode workers to `hardwareConcurrency - 1`
   (floored at 1). Decide: cherry-pick onto the stack (small, low-risk,
   single file) or land general-improvements separately.
2. **Hard cache-full fails ungracefully.** When even full eviction can't
   free enough, `makeRoom` gives up and lets Cornerstone throw
   (utilities.js:500-501) → generic toast. No cache-specific message exists
   in `messages.js`. A single exam larger than a 0.5 GB floor cache will
   reliably fail with no actionable guidance.
3. **Coarse sizing on non-Chrome / big / small machines.** Firefox/Safari
   stuck at 3 GB regardless of RAM; 64 GB workstations under-provisioned at
   4 GB (deviceMemory caps at 8); the `mirabelle.cacheGB` override is
   undiscoverable.
4. **Estimate slack.** `estimateExamBytes` is heuristic; under-estimates can
   let the cache overshoot before Cornerstone's own limit kicks in.
5. **CPU-RAM accounting only** — no GPU/VRAM view.

---

## Task: "A new cache usage preview tool in the header to monitor memory usage"

**Status: implemented (basic).** `src/components/CacheStatus.jsx` (69 lines,
`e5e9bfd`), mounted app-globally.

- **Displays:** `Cache X.X / Y.Y GB` from `cache.getCacheSize()` /
  `getMaxCacheSize()` (CacheStatus.jsx:33-34), plus a 1px utilization bar —
  green ≤75%, amber >75%, red >90% (:22-26). Tooltip "Cornerstone image
  cache: NN% used". Renders nothing until Cornerstone init (:46).
- **Polls, doesn't subscribe:** `setInterval` 1000 ms (:15, :42) — a
  documented choice (:7-9): per-image cache events fire thousands of times
  while a volume streams; polling two counters is cheaper. `setUsage` keeps
  previous object identity when unchanged so the header doesn't re-render
  idle (:36-39).
- **Mounted once, app-global:** `Header.jsx:74`, between title and
  username; `Header` renders once in `AppLayout.jsx:45`, so it persists
  across routes.
- **Complementary surface:** per-exam sizes already exist **in the IEC
  queue** — exact decoded bytes once loaded (`getLoadedExamSizeBytes`) or a
  `~` estimate pre-load (`recordSizeEstimate`, iecQueueData.js:206-222,
  derived free from the thumbnail's middle-frame metadata). Header = whole
  cache; queue = per exam.

### Gaps vs a full "cache usage preview tool"

- No per-exam breakdown in the header itself (data exists in the queue).
- No eviction feedback: no evicted count, trend, or "about to evict"
  warning — just the color change at 90%.
- Up-to-1 s lag (polling); no interactivity (not clickable/expandable); no
  manual "free memory" action anywhere in the UI.
- CPU-RAM only; no GPU/VRAM component.
- The `mirabelle.cacheGB` override isn't surfaced anywhere in the UI.

## Open questions for discussion

1. Merge strategy for `8d01850` (cherry-pick vs land general-improvements).
2. Do we want a cache-specific failure message ("This exam is larger than
   the image cache…") with a pointer to the size override?
3. Is a settings UI for cache size (replacing the localStorage secret)
   worth it for the Firefox/Safari and big-workstation cases?
4. Should the header widget grow (click-to-expand per-exam breakdown,
   manual purge) or stay minimal now that the queue shows per-exam sizes?

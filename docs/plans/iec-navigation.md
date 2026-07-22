# IEC List & Navigation — queue panel, next/prev flow, race guards

Component area: the queue of IECs a curator works through — the interactive
list panel, and the navigation machinery (next/previous/queue-click/
auto-advance) with its race protections.

Architecture note that shapes everything here: **the VR routes do not use
React Router loaders.** Only the single-exam routes attach `loader:` in
`src/index.js` (L82-188). Every `/vr/` route fetches its IEC list in a
`useEffect` in the route wrapper, and the queue's rows come from that state.

---

## Task: "An interactive IEC list with search and filtering is added"

**Status: implemented** across the three `iec-list` commits:

- `e98688f` — the panel (`IecQueue.jsx`), `iecQueueData.js`, mounting in all
  four VR routes.
- `0dadff1` — folds the queue into the NavigationPanel card; mask-draft badge
  + "Active mask" filter (see mask-selection.md).
- `d585e74` — loaded-state checkmark (`loadedExams.js`), size labels,
  volume/stack glyph + type filter, Loaded filter, disabled-while-loading,
  header context.

### Data flow — two tiers

**List fetch (route wrappers, useEffect):** all return **bare id arrays**.

- Mask: `getFilteredIECsForMaskVR` → `GET /papi/v1/masking/visualreview/{vr}?masking_status=…&dicom_file_type=…` (utilities.js:275-293; RouteMaskVR.jsx:64-87)
- Dicom review: `getFilteredIECsForDicomVR` → `POST /papi/v1/visualreviews/{vr}/filter` (utilities.js:224-261)
- Mask review: `getFilteredIECsForMaskReviewVR` → `…?awaiting_review=true` (utilities.js:303-321)
- Nifti: `getFilesForNiftiVR` → `GET /papi/v1/nifti/visualreview/{vr}` (utilities.js:327-333)

**Per-row enrichment (`iecQueueData.js`):** each row enriches itself via
`getQueueRowInfo(kind, id)` (L120-133) → per-kind fetchers (L73-111):
dicom-review pulls `/iecs/{iec}/info` (modality · series, file count,
review status, volumetric); mask/mask-review add `getMaskingDetails`;
nifti returns import name only, `status: undefined` deliberately so the UI
omits status dots/chips. Results are memoized in a module-level
`rowInfoCache` (remounts don't refetch; failures evicted for retry).
Request storms are prevented by concurrency limiters — 4 for info, 3 for
thumbnails (L21-43) — so a long VR can't starve the exam the curator is
actually loading.

**Thumbnails:** middle frame of the exam resolved from `/iecs/{iec}/frames`,
rendered via `loadImageToCanvas` at Thumbnail priority, stored as a **JPEG
data URL** so it survives cache eviction (iecQueueData.js:246-274). Rows
fetch only when scrolled into view (IntersectionObserver,
IecQueue.jsx:80-91), with a synchronous cached peek to avoid flicker.

### What a row shows (IecQueueRow, IecQueue.jsx:105-192)

Status dot (pending/done/skipped) · thumbnail · id · green brush badge when
a mask draft exists (mask route only) · volume/stack glyph
(`deployed_code`/`layers`) · modality · series line · image count · size
label (`~` estimate pre-load, exact bytes once loaded) · `check_circle`
when fully cached. The active row auto-scrolls into view (L120-122).

### Search & filters — all client-side, AND-combined (visibleIds memo, L371-403)

- **Search:** substring over `id + secondary` text (L391-392).
- **Status chips:** all/pending/done/skipped + synthetic "Active mask"
  (drafts) chip when drafts exist; counts shown per chip.
- **Type chips:** volume/stack — only rendered when the list mixes both.
- **Loaded toggle:** only when something is loaded.
- Self-healing: if the drafts or loaded filter empties, falls back to "all"
  (L359-369). Empty result renders "No matches."; a finished/total progress
  bar renders when statuses exist (L514-522).

### Row click → navigation

`onSelect(id)` → feature wrapper `handleSelectIec` (loading-guarded, resets
options/preset exactly like next/prev — e.g. MaskVR.jsx:45-51) → route
wrapper → `navigate(...)`. Same code path as the arrows, so the queue can't
bypass any guard. Non-active rows are disabled while loading (L133-134).

### Loaded state & sizes (`loadedExams.js`)

Covered in detail in [cache.md](cache.md). Queue-relevant behavior: each
feature-IEC marks its exam loaded only when verifiably complete, guarded by
`forId` so a transitional render can't tag the wrong exam
(MaskIEC.jsx:844-849 and equivalents); `pruneLoadedExams()` runs on every
queue `loading`/`currentId` change so eviction is reflected immediately.

### Mounting

Built by each feature-IEC and passed as **children of `NavigationPanel`**
(one card since `0dadff1`): MaskIEC.jsx:1020-1028/1158,
DicomReviewIEC.jsx:520-528, MaskReviewIEC.jsx:508-517,
NiftiReviewFile.jsx:369-378 (`idLabel="File"`). NavigationPanel detects
children and adds a `with-queue` class (NavigationPanel.jsx:29-34). There's
no queue-specific collapse; the whole left panel toggles via Redux
`panelConfig.open.left`.

### Known rough edges

- **No virtualization/pagination** — every visible row is a real DOM
  button. Enrichment is capped (`MAX_BACKGROUND_ENRICH = 400`, warn beyond)
  but a multi-thousand-IEC VR still mounts thousands of buttons.
- **Client-side filters can undercount while enrichment is in flight** —
  rows without status/type info yet are excluded from those filters, so
  "Pending 12" may grow as enrichment lands.
- **No in-list keyboard navigation** (arrows drive exam navigation, not a
  list cursor); no type-ahead beyond the search box.
- **Nifti rows are thin by design** (no dot/chips/thumbnail/count).
- Enrichment/thumbnail requests aren't cancelled at the network layer on
  unmount (idempotent via cache, just wasted work on fast scroll).
- Draft badge/filter are mask-route-only even though mask-review also
  handles masks — worth a product decision.

---

## Task: "Racing errors in IEC navigation were fixed"

**Status: implemented, layered across four commits** (one already on
develop). The load pipeline is a chain of awaits across three network
round-trips plus a streaming volume load — every await is a spot where a
newer navigation can interleave.

### The navigation flow

1. Trigger (hotkeys right/left/tab, nav buttons, queue click, or
   auto-advance) → feature wrapper `handleNext/Previous/SelectIec` — bails
   if `loading`, resets options/preset, calls the route wrapper.
2. Route wrapper computes the next id from the cached `iecList` and
   `navigate()`s. The list is deliberately **not** refetched on IEC change
   (RouteMaskVR.jsx:62-65) — holding an arrow key used to out-navigate a
   refetch and falsely toast "No next IEC".
3. URL `:iec` changes → reset effect dispatches
   `resetOptions/reset/setLoading(true)`.
4. Feature-IEC load effect (e.g. MaskIEC.jsx:300-534) — details fetches,
   volume/segmentation ids, then `loadVolumeAndSegmentation` (volume shell
   resolves; pixels stream; completion fires `VolumeReallyLoaded`) or
   background `loadStackSegmentation`.
5. Viewports mount, `await setVolumes/setStack`, camera setup.
6. `clearLoading` listener drops the spinner on
   `VolumeReallyLoaded`/`StackSegmentationReady`/`VolumeLoadFailed`.

### The four fixes

- **`c35d526` (develop) — request-generation guard.** `loadRequestRef`
  counter + `isCancelled` closure flag; after each await:
  `if (isCancelled || requestId !== loadRequestRef.current) return`.
  Stopped stale loads from setting state/mounting viewports for the wrong
  exam (DicomReviewIEC, MaskReviewIEC, MaskIEC).
- **`e5e9bfd` — viewport-level cancelled guards + exam-LRU generation.**
  Each viewport setup effect gets `cancelled` + a post-await supersede
  check `renderingEngine.getViewport(viewportId) !== viewport` (object
  identity detects the viewport was replaced, not merely unmounted) —
  fixed `reading 'getViewUp'` null crashes. In `utilities.js`, the
  `examLoadGeneration` token makes abandoned volume-load completions bail
  instead of stomping the current exam (also guards the volume having been
  evicted mid-flight); `startVolumeLoad` joins an already-streaming volume
  via `IMAGE_VOLUME_LOADING_COMPLETED` so revisits don't strand the
  spinner.
- **`e7fb0de` — awaits and isStale everywhere.** `setVolumes` awaited with
  guard (unhandled rejections `imageVolume … does not exist` /
  `getViewUp`); DicomReviewIEC gains an `isStale()` helper checked after
  *every* await including the `catch` (a stale run's `makeRoomForExam`
  could evict the volume the current run just created); MaskReviewIEC gets
  the same catch guard so abandoned loads fail silently.
- **`ed479ef` — guarded eviction.** Replaced
  `cache.filterVolumesByReferenceId` (reads `.referencedVolumeId` off
  unresolved entries → throw → incoming load failed) with
  `getVolumes().filter(v => v?.referencedVolumeId === key)`
  (utilities.js:478-492).

### Residual risks (for the plan)

1. **The `loading` guard has a commit gap.** Wrapper handlers read Redux
   `loading`, but after `navigate()` it only becomes true when the route's
   reset effect commits — a render tick later. A very fast second
   click/keypress passes the guard: no crash (generation counters absorb
   it) but it can skip an exam (A→C) or start two loads. Queue rows'
   `disabled` narrows this; hotkeys/arrows are still exposed.
2. **Double status write on double-press.** Status actions
   (`handleOperationsAction`, DicomReviewIEC.jsx:488-507 and equivalents)
   have no in-flight guard — pressing Good twice quickly issues two status
   POSTs for the same IEC plus two `onNext()` (the second is a stale
   closure to the same id, mostly benign; the duplicate write is real).
3. **MaskReviewIEC load effect doesn't tear down segmentations on cleanup**
   (unlike MaskIEC/DicomReviewIEC) — relies on the LRU; an asymmetry worth
   normalizing.
4. **Nifti route uses a different guard pattern** (`loaded` flag) than the
   other three (`stale` flag) — covered in practice via the wrapper guard,
   but worth unifying for maintainability.

### Auto-advance interaction (`1723938`, develop)

After each successful status POST the routes call `onNext()` — the same
loading-guarded wrapper handler, so auto-advance shares the guard rails.
MaskIEC only advances when the mask actually submitted
(`if (await handleAccept())`) and forgets the draft first with
`skipDraftSaveRef` so cleanup doesn't re-save it (MaskIEC.jsx:851-888).
After advancing, the queue re-fetches the just-acted-on row with
`{fresh:true}` (IecQueue.jsx:294-310) so its status dot and the progress
bar update without a full list refetch.

## Open questions for discussion

1. Close the `loading` commit gap? (e.g., a synchronous module-level
   "navigation in flight" latch set in the wrapper handler itself.)
2. Add an in-flight guard to status actions to prevent duplicate POSTs?
3. Virtualize the queue for multi-thousand-IEC VRs, or cap and page?
4. Extend the draft badge/filter to mask-review?
5. Server-side search/filter — worth it, or is client-side adequate for
   realistic VR sizes?

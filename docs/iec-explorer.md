# IEC Explorer — Implementation Notes

A searchable grid of the review's exams, in its own card under the
Navigation panel of every VR route. Ported from the `iec-list` branch (where
it was a list called the IEC queue) and redesigned.

**Branch:** `all-features-explorers` (first ported, as a list, on
`iec-explorer`)

**Audience:** developers touching the VR routes or the exam cache.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/IecExplorer.jsx](../src/components/IecExplorer.jsx) | The card: search, filters, the virtualized thumbnail grid |
| [src/lib/iecExplorerData.js](../src/lib/iecExplorerData.js) | Row details (remembered in the browser), thumbnails, size estimates |
| [src/lib/loadedExams.js](../src/lib/loadedExams.js) | Which exams are fully in the cache |
| [src/lib/examDownloads.js](../src/lib/examDownloads.js) | `isExamFile`, for the thumbnails |
| [src/lib/renderImageToCanvas.js](../src/lib/renderImageToCanvas.js) | Draws a thumbnail (shared with the slice browser) |
| [src/components/CollapsiblePanel.jsx](../src/components/CollapsiblePanel.jsx) | The foldable card it sits in ([collapsible-panels.md](collapsible-panels.md)) |

The four VR routes (DICOM review, Mask, Mask Review, NIfTI review) pass their
list and a select handler down through their wrapper to the exam component,
which renders the explorer after its `NavigationPanel`.

---

## 1. What curators see

- A two-column grid of tiles, one per exam: the middle frame's thumbnail with
  the id and image count over its foot, a status dot top left (amber pending,
  green done, grey skipped), and top right a brush for an unsubmitted mask
  selection and a check for an exam fully in the cache. Under it, the
  volume/stack icon, modality and series, and the size in memory (`~` while
  estimated).
- The card's title shows "done/total"; a thin progress bar sits under it.
- Search by id or series. A segmented status filter (All / Pending / Done /
  Skipped, plus the brush for unsubmitted selections on the Mask route), and
  3D / Stack / Loaded toggles that combine with it.
- Clicking a tile opens that exam. The open exam is outlined and kept in view
  as the curator moves with the arrows.
- The card folds to its title like the others. While it's open it takes the
  column's spare height (at least about half); folding Tools gives it the
  whole column.

NIfTI tiles show the file name only: its details have no status, and a
thumbnail would cost a download of the whole volume.

## 2. Speed

- **Rows on screen first.** Details requests (1 per row, 2 on the Mask
  routes) run four at a time. Every row is queued for a background fill in
  list order (the first 400), and the rows in view are hurried to the front
  of that queue, so the tiles being looked at fill in first.
- **Only the rows in view are rendered**, plus two either side, inside a
  spacer the grid's full height. A VR with thousands of IECs scrolls like
  one with ten, and only rendered tiles ask for thumbnails.
- **Thumbnails wait for a tile to settle.** A tile asks for its thumbnail
  after 150 ms on screen, so flinging the grid past rows doesn't queue a
  download for each. A thumbnail that failed isn't tried again for a minute.
- **Batched updates.** Details are applied at most once a frame, tiles are
  memoized, and they get a stable click handler, so a resolving row
  re-renders only its own tile.
- **Details remembered between sessions.** Each row's details and size
  estimate are kept in `localStorage` (`mirabelle.iecExplorer.v1`, up to 5000
  of each, oldest dropped first) and shown at once after a reload while the
  background fill refreshes them. Thumbnails are not kept: they're renders of
  the images.

Thumbnails are still the slow part: each downloads its exam's middle DICOM
file, behind the exam on screen. A server-rendered thumbnail endpoint would
remove that download.

## 3. Differences from the `iec-list` branch

- **No navigation block.** `iec-list` disabled next/previous and the rows while
  an exam loaded. This branch pauses a left exam's download instead
  (`lib/examDownloads`), so the explorer navigates mid-load like
  next/previous.
- **Clicking the exam on screen does nothing.** It would reset the tool
  options, and on the Mask route that reloads the exam and wipes a just
  submitted mask.
- **Thumbnails go through the download queue.** A thumbnail's frame download
  waits behind the exam on screen, like any other request that isn't the
  current exam's. Two adjustments:
  - A frame of an exam opened earlier this session is held while the curator
    is elsewhere, and a held thumbnail would hold up all the ones behind it
    (three render at a time). So it's drawn only once that exam has the frame
    in the cache; until then the tile keeps its placeholder and asks again
    when it next mounts.
  - Only the JPEG data URL is kept. The decoded frame is removed from the image
    cache, where every listed exam's frame would sit outside the exam cache's
    budget, unless an exam has it or opened meanwhile.
- **Thumbnails are 256px**, about twice the tiles' size, for retina screens.
- **Thumbnails are drawn by `lib/renderImageToCanvas`**, not Cornerstone's
  `loadImageToCanvas`. That one turned a PT series with an identity rescale
  (slope 1, intercept 0) into an error toast ("Cannot read properties of
  undefined (reading 'scaled')"): its renderer reads `image.preScale.scaled`
  for PT, and the DICOM loader leaves `preScale` out when it didn't rescale.
  And as it never passes a render error on, the thumbnail never finished,
  holding one of the three render slots for good.
- **Failures are logged** (`[iecExplorerData]` warnings) rather than dropped.

The header glyph, the "IEC · modality · series" detail and the mask-draft
observable were ported earlier.

## 4. Testing

Manual — no automated tests were added.

1. Open a DICOM review, Mask, Mask Review and NIfTI VR. The IEC Explorer card
   sits under Navigation, with Tools below it.
2. Scroll the grid: the tiles in view fill in first, thumbnails and size
   estimates arrive as tiles settle, and the exam on screen keeps loading.
3. Click a tile: that exam opens. Click it again: nothing happens.
4. Press Right/Left: the outlined tile follows, scrolled into view.
5. Click a tile while the current exam is still loading: the new exam opens,
   and going back to the first one resumes its download.
6. Set a status (e.g. Good): the tile's dot, the title's count and the
   progress bar update after moving on.
7. Once an exam has fully loaded, its tile shows the check and its exact
   size. The Loaded toggle filters to such tiles.
8. On the Mask route, draw a selection and move on without submitting: the
   tile shows the brush, and the brush filter lists it.
9. Reload the page: every tile shows its series and status at once, before
   any request has come back.
10. Fold Tools: the grid takes the column. Fold the explorer: Tools takes it.

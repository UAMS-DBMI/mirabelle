# IEC Queue — Implementation Notes

A searchable list of the review's exams in the navigation panel of every VR
route, ported from the `iec-list` branch.

**Branch:** `iec-explorer`

**Audience:** developers touching the VR routes or the exam cache.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/IecQueue.jsx](../src/components/IecQueue.jsx) | The panel: search, filters, rows, progress bar |
| [src/lib/iecQueueData.js](../src/lib/iecQueueData.js) | Row details, middle-frame thumbnails and size estimates, cached per session |
| [src/lib/loadedExams.js](../src/lib/loadedExams.js) | Which exams are fully in the cache |
| [src/lib/examDownloads.js](../src/lib/examDownloads.js) | `isExamFile`, for the thumbnails |
| [src/components/NavigationPanel.jsx](../src/components/NavigationPanel.jsx) | Renders the queue as its children |

The four VR routes (DICOM review, Mask, Mask Review, NIfTI review) pass their
list and a select handler down through their wrapper to the exam component,
which puts the queue in its `NavigationPanel`.

---

## 1. What curators see

- One row per exam: status dot, middle-frame thumbnail, id, modality and
  series, volume/stack icon, image count, and its size in memory (`~` while
  estimated).
- Search by id or series; filter chips by status (Pending / Done / Skipped),
  type (3D / Stack, when the list has both) and Loaded; on the Mask route, an
  Active mask chip for exams with an unsubmitted selection.
- A checkmark on rows whose exam is fully in the cache and reopens instantly.
- "N of M done" and a progress bar.
- Clicking a row opens that exam. The exam on screen stays highlighted and in
  view, whichever way the curator moved.

NIfTI rows show the file name only: its details have no status, and a
thumbnail would cost a download of the whole volume.

## 2. Differences from the `iec-list` branch

- **No navigation block.** `iec-list` disabled next/previous and the rows while
  an exam loaded. This branch pauses a left exam's download instead
  (`lib/examDownloads`), so the queue navigates mid-load like next/previous.
- **Clicking the exam on screen does nothing.** It would reset the tool
  options, and on the Mask route that reloads the exam and wipes a just
  submitted mask.
- **Thumbnails go through the download queue.** A thumbnail's frame download
  waits behind the exam on screen, like any other request that isn't the
  current exam's. Two adjustments:
  - A frame of an exam opened earlier this session is held while the curator
    is elsewhere, and a held thumbnail would hold up all the ones behind it
    (three render at a time). So it's drawn only once that exam has the frame
    in the cache; until then the row keeps its placeholder and asks again on
    the next mount.
  - Only the JPEG data URL is kept. The decoded frame is removed from the image
    cache, where every listed exam's frame would sit outside the exam cache's
    budget, unless an exam has it or opened meanwhile.
- **Thumbnails are 128px**, as the code intended (`thumbnail: true` made them
  256px).
- **Failures are logged** (`[iecQueueData]` warnings) rather than dropped.

The header glyph, the "IEC · modality · series" detail and the mask-draft
observable were ported earlier.

## 3. Testing

Manual — no automated tests were added.

1. Open a DICOM review, Mask, Mask Review and NIfTI VR. The queue sits in the
   Navigation panel, under the arrows, with the tools panel still visible
   below.
2. Scroll the queue: thumbnails and size estimates fill in as rows come into
   view, without slowing the exam on screen.
3. Click a row: that exam opens. Click it again: nothing happens.
4. Press Right/Left: the highlighted row follows, scrolled into view.
5. Click a row while the current exam is still loading: the new exam opens,
   and going back to the first one resumes its download.
6. Set a status (e.g. Good): the row's dot and the progress bar update after
   moving on.
7. Once an exam has fully loaded, its row shows the checkmark and its exact
   size. The Loaded chip filters to such rows.
8. On the Mask route, draw a selection and move on without submitting: the row
   shows the brush marker, and the Active mask chip lists it.

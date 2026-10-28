# Decimation PHI Notice — Implementation Notes

Decimate loads fewer slices of a series to keep big volumes fast. A skipped
slice is never shown, so **PHI on it (burned-in text, faces) can't be seen by
the curator**. Decimate is also sticky: it stays on across exams (Persistent)
and lives in the URL (`?decimate=N`), so a curator can set it once and forget
it for thousands of exams.

This change tells curators when slices were skipped on the exam in front of
them, without a toast on every exam.

**Branch:** `decimate-url-main` (after "Keep the decimate count in the URL")

**Audience:** developers touching decimation, the Tools panel, or the exam load
path in the review and mask routes.

**Modules:**

| File | Responsibility |
|---|---|
| [src/utilities.js](../src/utilities.js#L210) | `getIECInfo` returns `frameCounts`; step helpers next to `decimateFrames` |
| [src/components/DecimationNotice.jsx](../src/components/DecimationNotice.jsx) | The message under the Decimate input and its hover details |
| [src/components/DecimationNotice.css](../src/components/DecimationNotice.css) | Amber / calm callouts and the hover panel |
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx#L199) | Renders the notice; amber input border while Decimate > 0 |
| [src/lib/messages.js](../src/lib/messages.js#L61) | All copy, under `decimation` |
| `DicomReviewIEC`, `MaskReviewIEC`, `MaskIEC` | Keep `frameCounts` per exam and pass it to `ToolsPanel` |

---

## 1. What curators see

Under the Decimate input, one of three states:

| State | Shown |
|---|---|
| Slices were skipped on this exam | Amber callout: "75 of 148 slices shown / 73 hidden. PHI on them won't be seen." |
| Decimate is 0 and nothing was skipped | Calm callout: "Decimate is off / All 148 slices shown." |
| Decimate is set but this exam has fewer slices than the value | Nothing |

The amber callout only appears when frames were **actually dropped**. An exam
with fewer frames than the decimate count is loaded in full, so warning there
would be noise. Keeping the warning rare is what keeps curators reading it;
that is also why it is not a toast.

Hovering either callout opens a "How Decimate works" panel:

- **Amber:** walks through this exam's numbers — total slices, the Decimate
  value, the step chosen, the count kept, which other values give the same
  count, and the nearest values that don't.
- **Calm:** a general explanation with a worked example.

The Decimate input also gets an amber border while a value above 0 is applied,
because that value carries over to every following exam.

The panel is portalled to `document.body` with `position: fixed`, beside the
callout. The side panel has `overflow: hidden`, which would clip a tooltip
rendered inside it.

## 2. The load limit

When Decimate is 0, each view still asks `getIECInfo` for at most **2000**
frames ([DicomReviewIEC.jsx:258](../src/features/dicom-review/DicomReviewIEC.jsx#L258),
and the same in the other two views). A series over that limit is decimated
even though the curator never chose it. The amber callout covers this case too;
its hover says the series is over the viewer's slice limit instead of naming a
Decimate value.

## 3. How the counts reach the Tools panel

1. `getIECInfo` counts the frames before decimating and returns
   `frameCounts: { shown, total, step, max }` alongside `frames`
   ([utilities.js:210](../src/utilities.js#L210)). `max` is the count that was
   requested (the Decimate value, or 2000).
2. Each view stores it with `setFrameCounts(frameCounts)` in its load effect
   ([DicomReviewIEC.jsx:275](../src/features/dicom-review/DicomReviewIEC.jsx#L275),
   [MaskReviewIEC.jsx:218](../src/features/mask-review/MaskReviewIEC.jsx#L218),
   [MaskIEC.jsx:267](../src/features/mask/MaskIEC.jsx#L267)) and passes it to
   `ToolsPanel`.
3. `ToolsPanel` hands it to `DecimationNotice`, which picks the state from
   `frameCounts` and the Decimate value in Redux.

The counts are local React state, not Redux, so they belong to the exam that
was loaded. A new exam or a new Decimate value reloads and replaces them.

## 4. Why 100, 120 and 140 all show 75 slices

`decimateFrames` keeps every `step`-th frame, plus the last frame
([utilities.js:247](../src/utilities.js#L247)). The step is the smallest whole
number that fits within the requested count: `ceil(total / max)`. So the
Decimate value is a **ceiling**, and only a few counts are possible per series.
For 148 frames:

| Decimate | Step | Slices shown |
|---|---|---|
| 148 or more | 1 | 148 (no decimation) |
| 74–147 | 2 | 75 |
| 50–73 | 3 | 50 |
| 37–49 | 4 | 38 |

The hover lists these ranges for the current series. The maths is in three
small exported helpers, so the hover can't disagree with what loads:

- `decimationStep(total, maxFrames)`: the step `decimateFrames` uses.
- `framesKeptAtStep(total, step)`: frames kept, including the added last frame.
- `decimateRangeForStep(total, step)`: the Decimate values that give a step.

### Why not pick exactly N slices?

Spreading exactly N slices evenly (mixed gaps of 1 and 2) would make 120 give
120. The display would barely change, because Cornerstone builds a regular grid
from the first slice and one spacing value, and each slice would land within
half an original slice of its grid position. **Masking is the problem.** A
volume mask is submitted as slice index × volume spacing
([MaskIEC.jsx:513](../src/features/mask/MaskIEC.jsx#L513),
[masking.js:182](../src/masking.js#L182)). That is exact only when every gap is
the same. With mixed gaps a mask edge can be off by up to about one original
slice, which could leave a PHI slice at the edge unmasked.

Exact counts were considered and turned down for now. Doing it safely would
mean working out mask positions from each slice's real position instead of
index × spacing, which changes the mask submission and needs testing on real
masks first.

## 5. Testing

Manual — no automated tests were added. The helpers were checked against the
real picking loop for every series size from 2 to 3000 at several Decimate
values, with no mismatches.

**Skipped slices**

1. Open a volume with more slices than you'll set (e.g. 148), set Decimate to
   100 and press Refresh.
2. The amber callout shows "75 of 148 slices shown" and the input has an amber
   border.
3. Hover the callout: the panel says 74–147 gives 75, and lists 148 or more
   (all) and 50–73 (50) as other choices.
4. Try 120 and 140: same count, same range.

**Nothing skipped**

1. Set Decimate higher than the exam's slice count: no message.
2. Set Decimate to 0: the calm "Decimate is off / All N slices shown" line;
   hovering shows the general explanation.

**Load limit**

1. With Decimate at 0, open a series of more than 2000 slices.
2. The amber callout appears; its hover says the series is over the viewer's
   slice limit and does not suggest setting Decimate to 0.

**Views**

The notice appears in Dicom Review, Mask Review and the Mask view. NIfTI
review hides the Decimate control and is unaffected.

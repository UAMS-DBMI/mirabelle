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
| [src/components/DecimationNotice.jsx](../src/components/DecimationNotice.jsx) | The message shown under the Decimate input (details panel switched off) |
| [src/components/DecimationNotice.css](../src/components/DecimationNotice.css) | Amber / light callouts and the (unused) details panel |
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx#L194) | Renders the notice; Escape dismisses it; amber input border while Decimate > 0 |
| [src/features/tools/ToolsPanel.css](../src/features/tools/ToolsPanel.css#L66) | Shows the notice only while the input is hovered |
| [src/lib/messages.js](../src/lib/messages.js#L61) | All copy, under `decimation` |
| `DicomReviewIEC`, `MaskReviewIEC`, `MaskIEC` | Keep `frameCounts` per exam and pass it to `ToolsPanel` |

---

## 1. What curators see

The message appears **only while the pointer is over the Decimate input**,
floating just below the input row on top of the tools underneath. It shows one
of three states:

| State | Shown on hover |
|---|---|
| Slices were skipped on this exam | Amber callout: "75 of 148 slices shown / 73 hidden. PHI on them won't be seen." |
| Decimate is 0 and nothing was skipped | Light callout (white, grey border, in both themes): "Decimate is off / All 148 slices shown." |
| Decimate is set but this exam has fewer slices than the value | Nothing |

The amber callout only appears when frames were **actually dropped**. An exam
with fewer frames than the decimate count is loaded in full, so warning there
would be noise. Keeping the warning rare and on demand is what keeps curators
reading it; that is also why it is not a toast.

The always-visible signal is the amber border on the Decimate input while a
value above 0 is applied, because that value carries over to every following
exam. A curator who never hovers the input sees only that border, not the
hidden-slice count.

**Hover and dismiss.** Showing and hiding is plain CSS, like the Persistent and
Refresh tooltips: the notice is rendered inside `.decimate-control-row` right
after the input, positioned `absolute` / `top-full`, and shown by
`.decimate-input:hover ~ .decimation-notice`
([ToolsPanel.css:66](../src/features/tools/ToolsPanel.css#L66)). Pressing
**Escape** anywhere hides it: a window `keydown` listener in `ToolsPanel` sets
`is-notice-dismissed` on the row, and moving the pointer back onto the input
clears it ([ToolsPanel.jsx:92](../src/features/tools/ToolsPanel.jsx#L92)).

**Details panel (switched off).** A "How Decimate works" panel that walked
through the exam's numbers is still in `DecimationNotice.jsx` but hidden behind
`SHOW_HOW_IT_WORKS = false`
([DecimationNotice.jsx:12](../src/components/DecimationNotice.jsx#L12)), along
with the ⓘ icon. Setting it to `true` brings it back on hover of the callout.
It is portalled to `document.body` with `position: fixed`, because the side
panel has `overflow: hidden`. Note that the callout now hides as soon as the
pointer leaves the input, so it would also need to stay open while hovered
before the panel is usable again.

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

The (currently switched-off) details panel lists these ranges for the current
series. The maths is in three small exported helpers, so the panel can't
disagree with what loads:

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
2. The input has an amber border and no message is shown.
3. Hover the input: the amber callout "75 of 148 slices shown" appears under
   the row, over the tools below. Move away: it disappears.
4. Hover again and press Escape: it disappears. Leave and re-enter the input:
   it comes back.
5. Try 120 and 140: same count.

**Nothing skipped**

1. Set Decimate higher than the exam's slice count: hovering shows nothing.
2. Set Decimate to 0: hovering shows the light "Decimate is off / All N slices
   shown" callout, white in both light and dark mode.

**Load limit**

1. With Decimate at 0, open a series of more than 2000 slices.
2. Hovering the input shows the amber callout even though Decimate is 0.

**Views**

The notice appears in Dicom Review, Mask Review and the Mask view. NIfTI
review hides the Decimate control and is unaffected.

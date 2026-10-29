# Decimation Notice — Implementation Notes

Hovering the Decimate input now says how many slices of this exam are shown and
warns when some are hidden, because PHI on a hidden slice is never seen.

**Branch:** `image-navigation-fix-develop-main` (ported from
`decimate-url-main`)

**Commit:** Warn curators when decimation hides slices

**Audience:** developers touching the Tools panel, Decimate, or `getIECInfo`.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/DecimationNotice.jsx](../src/components/DecimationNotice.jsx) | Picks the notice for the current exam and Decimate value |
| [src/components/DecimationNotice.css](../src/components/DecimationNotice.css) | Amber warning and calm callout styles |
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx) | Renders the notice, the Escape dismissal, the amber input border |
| [src/features/tools/ToolsPanel.css](../src/features/tools/ToolsPanel.css#L105) | Shows the notice only while the input is hovered |
| [src/lib/messages.js](../src/lib/messages.js#L61) | All copy, under `decimation` |
| [src/utilities.js](../src/utilities.js#L206) | `getIECInfo` returns `frameCounts` |

---

## 1. What curators see

Decimate keeps every step-th slice so at most that many load. Skipped slices
are never downloaded, so burned-in text or a face on one of them can't be seen.
The notice makes that visible:

| Situation | Notice |
|---|---|
| Slices were skipped | Amber: "N of M slices shown" / "K hidden. PHI on them won't be seen." |
| Decimate is 0, nothing skipped | Calm: "Decimate is off" / "All M slices shown." ("Every slice will be loaded." before an exam has loaded) |

The amber case also covers the load limit: with Decimate at 0, each route
still asks for at most 2000 frames, so a larger series is decimated anyway.

The input gets an amber border while Decimate is above 0
([ToolsPanel.jsx:268](../src/features/tools/ToolsPanel.jsx#L268)), so a
curator who never hovers it still sees that decimation is on.

## 2. Hover and dismiss

The notice is rendered inside `.decimate-control-row`, right after the input,
and shown by plain CSS (`.decimate-input:hover ~ .decimation-notice`,
[ToolsPanel.css:121](../src/features/tools/ToolsPanel.css#L121)). It floats
under the row (`absolute`, `top-full`), over the tools below.

Pressing Escape anywhere hides it: a window `keydown` listener sets
`is-notice-dismissed` on the row, and moving the pointer back onto the input
clears it ([ToolsPanel.jsx:126](../src/features/tools/ToolsPanel.jsx#L126)).

## 3. How the counts reach the panel

1. `getIECInfo` counts the frames before decimating and returns
   `frameCounts: { shown, total }` alongside `frames`
   ([utilities.js:206](../src/utilities.js#L206)).
2. The mask, mask review and DICOM review routes keep it in state when they load
   an exam
   ([MaskIEC.jsx:509](../src/features/mask/MaskIEC.jsx#L509),
   [MaskReviewIEC.jsx:265](../src/features/mask-review/MaskReviewIEC.jsx#L265),
   [DicomReviewIEC.jsx:342](../src/features/dicom-review/DicomReviewIEC.jsx#L342))
   and pass it to `ToolsPanel`.
3. `ToolsPanel` hands it to `DecimationNotice`, which picks the state from
   `frameCounts` and the Decimate value in Redux.

The counts are local React state, not Redux, so they always belong to the exam
on screen. A new exam or a new Decimate value reloads and replaces them.

## 4. What was left out of the port

`decimate-url-main` also had a "How Decimate works" hover panel, already
switched off there (`SHOW_HOW_IT_WORKS = false`), and the step helpers and copy
that fed it, plus `docs/decimation-phi-notice.md`. None of it changed what
curators see, so this port leaves it out: `frameCounts` carries only `shown`
and `total`, and `decimateFrames` is unchanged. The URL commit from that branch
wasn't needed either; this branch already reads and writes `?decimate=`.

## 5. Testing

Manual — no automated tests were added.

1. Open an exam with more slices than the Decimate value (for example
   `?decimate=10`). The input has an amber border. Hover it: the amber notice
   shows "N of M slices shown" and the hidden count.
2. Press Escape. The notice hides; move off and back onto the input and it
   returns.
3. Set Decimate to 0 and apply. Hovering shows "Decimate is off / All M slices
   shown."
4. Repeat on the mask, mask review and DICOM review routes.

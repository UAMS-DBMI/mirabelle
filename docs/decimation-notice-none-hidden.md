# Decimation Notice: None Hidden — Implementation Notes

Hovering the Decimate input now also says something when Decimate is set but
the series is small enough that nothing is skipped.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Show the decimation notice when no slices are hidden

**Audience:** developers touching the decimation notice. Read
[decimation-notice.md](decimation-notice.md) first.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/DecimationNotice.jsx](../src/components/DecimationNotice.jsx#L51) | The `is-all-shown` state |
| [src/components/DecimationNotice.css](../src/components/DecimationNotice.css#L12) | Shares the calm "Decimate is off" style |
| [src/lib/messages.js](../src/lib/messages.js#L66) | `decimation.noneHidden` |

---

## 1. The problem

`decimateFrames` only drops slices when the series has **more** frames than
the Decimate value. With Decimate at or above the slice count (2 slices,
Decimate 12, or Decimate 2), nothing is skipped. The notice deliberately
returned nothing in that case, so hovering the input showed no feedback even
though the input had its amber "decimating" border.

## 2. The fix

`DecimationNotice` now has three states, checked in this order:

| Order | Condition | Notice |
|---|---|---|
| 1 | Slices were skipped | Amber "N of M slices shown / K hidden…" |
| 2 | Decimate is 0 | Calm "Decimate is off" |
| 3 | Counts are known (Decimate set, nothing skipped) | Calm "N of N slices shown" / "None hidden." |

State 3 reuses `decimation.slicesShown` for the title, so it reads the same as
the amber line, and uses the calm callout style, so it doesn't look like a
warning.

The detail is just "None hidden." An earlier draft said "Decimate is above
this series' slice count", which was wrong when the two are equal, so the
explanation was dropped rather than reworded.

## 3. Not changed

While an exam is loading and its counts aren't known, hovering with Decimate
set still shows nothing.

## 4. Testing

Manual — no automated tests were added.

1. Open a 2-slice exam with `?decimate=12`. Hover the input: "2 of 2 slices
   shown / None hidden."
2. Set Decimate to 2 (equal to the slice count) and apply. Same message.
3. Set Decimate to 1 and apply. The amber notice shows "1 of 2 slices shown /
   1 hidden."

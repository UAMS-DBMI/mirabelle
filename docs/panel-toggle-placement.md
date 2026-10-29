# Panel Toggle Placement — Implementation Notes

The round ‹ › buttons that collapse the side panels no longer cover the slice
scrollbar of the edge panes.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Keep the panel toggle buttons off the slice scrollbar

**Audience:** developers touching the viewer layout.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/ViewerResizer.css](../src/components/ViewerResizer.css) | Size and offset of the side-panel toggle buttons |

---

## 1. The problem

`#viewer-resizer` is an `absolute inset-0` overlay inside `.viewer`, so its
edges are the viewer's padding box: inside the 4px border, with 8px of padding
before the panes. The buttons sat at the vertical middle of each edge:

- 40px wide (`p-2` around a 24px icon), offset `-1.4rem` (22.4px);
- so 17.6px of each button was inside the padding box, 9.6px of it over the
  edge pane;
- the scrollbar runs 4–12px in from the pane's right edge, so the right button
  covered almost all of it, including the thumb.

## 2. The fix

- `p-2` → `p-1`: the buttons are 32px.
- `-1.4rem` → `-1.5rem` (24px): 8px of each button stays inside, which is
  exactly the viewer's padding.

The inner edge now stops at the pane's edge, with the scrollbar's 4px inset as
clearance. On the outside the buttons reach about 2px further toward the side
panels than before.

## 3. Testing

Manual — no automated tests were added.

1. Open a volume exam. The ‹ › buttons sit on the viewer's left and right
   edges, and the right panes' scrollbars and thumbs are fully visible and
   draggable next to them.
2. Open a stack exam. The same holds for its single pane.
3. Click each button: the side panels still collapse and reopen, and the
   chevron still flips.

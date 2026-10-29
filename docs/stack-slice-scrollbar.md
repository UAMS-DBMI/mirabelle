# Stack Slice Scrollbar — Implementation Notes

The stack viewport now has the same slice scrollbar as the 2D volume panes.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Add the slice scrollbar to the stack viewport

**Audience:** developers touching the stack viewport. How the scrollbar works
is in [viewer-ui-improvements.md](viewer-ui-improvements.md) §4.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/StackViewport.jsx](../src/components/StackViewport.jsx#L215) | Attaches the scrollbar after `setStack`, detaches it on unmount |

---

## 1. The problem

`attachSliceScrollbar` was wired into `VolumeViewport` only. The stack viewport
had no slice indicator at all, though a stack is where one is most expected.
[viewer-ui-improvements.md](viewer-ui-improvements.md) listed this as a known
gap.

## 2. The fix

`StackViewport` attaches the scrollbar the same way `VolumeViewport` does:

- after `setStack` and the data-boundary frame, it calls the previous detach
  (if any) and attaches a new one, held in `scrollbarDetachRef`;
- the unmount cleanup calls the detach.

[sliceScrollbar.js](../src/lib/sliceScrollbar.js#L43) needed no change.
Cornerstone's `StackViewport` has the three methods it relies on:
`getNumberOfSlices`, `getSliceIndex` and `scroll`. `IMAGE_RENDERED`, which the
scrollbar listens to, fires on stacks too.

The styles live in `VolumeViewport.css`. That file is always in the bundle,
because no route is lazy-loaded and every route that renders a stack also
imports `VolumeView`.

## 3. Not changed

- A single-frame stack shows no scrollbar: `readSlicePosition` needs at least two
  slices ([sliceScrollbar.js:30](../src/lib/sliceScrollbar.js#L30)).
- The stack viewport still has no expand button; it already fills its route.

## 4. Testing

Manual — no automated tests were added.

1. Open a multi-frame stack exam. A scrollbar runs down the right edge of the
   pane.
2. Scroll with the wheel: the thumb follows. Drag the thumb: the frames change,
   and hovering shows "N / total".
3. Navigate to another stack exam. A single scrollbar is shown, for the new
   stack.
4. Open a single-frame stack. No scrollbar.

# Always-Visible Viewport Controls — Implementation Notes

The slice scrollbar and the expand (maximize) button are now always visible on
the 2D panes instead of appearing only on hover. The one exception is MIP and
MinIP, where the scrollbar stays hidden because scrolling there changes
nothing (see §3).

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Always show slice scrollbars and expand buttons

**Audience:** developers touching the viewport overlays. Background in
[viewer-ui-improvements.md](viewer-ui-improvements.md) §3–4.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/VolumeViewport.css](../src/components/VolumeViewport.css#L45) | Scrollbar track: no hover fade; still hidden under `.viewport.projection` |
| [src/components/ViewportExpandButton.css](../src/components/ViewportExpandButton.css#L7) | Expand button: no hover fade |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) | Adds the `projection` class in MIP / MinIP |

---

## 1. What hid them

Both controls had `opacity: 0` and were revealed by `.viewport:hover …`. Off
hover, there was no sign a pane could be scrolled or expanded.

Separately, commit `52d7288` tagged the viewport element with a `projection`
class in MIP and MinIP and hid the scrollbar under it (`visibility: hidden`),
since the projection slab spans the whole volume and the slice position stops
meaning anything. That hiding is intentional and stays (§3).

## 2. The change

- `.viewport-slice-scrollbar` and `.viewport-expand-button` no longer start at
  `opacity: 0`, and the hover rules that revealed them are gone. Their
  transitions keep only the properties that still change.
- The `.viewport.projection` rule and the `isProjection` class in
  `VolumeViewport.jsx` are untouched. The original always-visible commit
  removed them; `52d7288` was cherry-picked back on top, so the two changes
  coexist. They don't conflict: the projection rule uses `visibility`, not
  `opacity`, so it hides the scrollbar regardless of the hover styling.

Hover still does something: the scrollbar widens from 8px to 10px while
hovered or dragged, and the expand button darkens when hovered.

## 3. Trade-offs

- In MIP and MinIP the scrollbar is hidden. Scrolling there doesn't change the
  projected image, so a visible, draggable scrollbar would be misleading. The
  always-visible rule applies to every other view mode.
- The scrollbar still hides itself (`display: none`) when a pane has no slice
  position to show — before its volume is ready, or with fewer than two slices
  ([sliceScrollbar.js:60](../src/lib/sliceScrollbar.js#L60)). There is nothing
  to scroll then.

## 4. Testing

Manual — no automated tests were added.

1. Open a volume exam. Without hovering, each 2D pane shows its scrollbar on
   the right edge, and each pane shows its expand button in the top-right
   corner.
2. Switch to MIP, then MinIP. The scrollbars disappear. Switch back to the
   slice view and they return without hovering.
3. Hover a scrollbar: it widens. Hover an expand button: it darkens.

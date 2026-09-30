# Stack Single Selection — Implementation Notes

On a stack in the mask route, each rectangle you draw now **replaces** the
previous selection instead of adding to it. Stray rectangles no longer silently
grow the submitted mask.

**Branch:** `stack-single-selection-fix` (from `main`)

**Audience:** developers touching the mask route's selection tool or the stack
accept path.

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/singleSelectionRectangleScissors.js](../src/lib/singleSelectionRectangleScissors.js) | `SingleSelectionRectangleScissorsTool` — clears the old stack selection before filling a new one |
| [src/features/tools/toolsManager.js](../src/features/tools/toolsManager.js) | Registers the tool globally, adds it to the tool group, activates it for `LeftClickOptions.SELECTION` |
| [src/features/volume-view/VolumeView.jsx](../src/features/volume-view/VolumeView.jsx) | Registers the same tool (see §3 for why) |

---

## 1. The problem

A stack has no Expand step: `setStackConfig` hides the Expand Selection button
([presentationSlice.js:348](../src/features/presentationSlice.js#L348)).
Instead, Accept reads the selection straight from the labelmap —
`getCoordsForStackSeg`
([utilities.js:67](../src/utilities.js#L67), called from
[MaskIEC.jsx:504](../src/features/mask/MaskIEC.jsx#L504)) scans every labelmap
pixel and returns the bounding box of everything painted.

The stock `RectangleScissorsTool` adds each rectangle to the labelmap. So
drawing several rectangles — to correct a first attempt, or by an accidental
drag — left all of them painted, and Accept submitted one large box covering
all of them. Nothing on screen showed that final box before it was sent.

## 2. The fix

`SingleSelectionRectangleScissorsTool` extends the stock tool and wraps its
`_endCallback` — the mouse-up handler that fills the drawn rectangle into the
labelmap. Before the stock fill runs, it zeroes the pixel data of every labelmap
image in the segmentation. The fill then paints only the new rectangle, and its
own data-modified event re-renders the viewport.

`_endCallback` is an instance property assigned in the base constructor, not a
prototype method, so it has to be wrapped in the subclass constructor after
`super()` rather than overridden as a method.

The clear is skipped when:

- **the viewport isn't a stack** (`viewport.type !== Enums.ViewportType.STACK`).
  Volume selections still accumulate and are turned into a 3D region by Expand;
  that flow is unchanged.
- **the mouse didn't move** (`newAnnotation && !hasMoved`). The stock tool fills
  nothing on a plain click, so clearing there would wipe the selection for no
  new one.

Accept, Clear and `getCoordsForStackSeg` are untouched: the bounding box they
compute is now simply the last rectangle.

## 3. Registration

The subclass sets `toolName` to the stock `RectangleScissorsTool.toolName`, so
tool-group references by name keep working unchanged.

That shared name is also why `VolumeView.jsx` had to change.
`cornerstoneTools.addTool` ignores a second tool registered under a name that is
already taken. The mask route switches between volume and stack exams in one
session, and `VolumeView` registers the scissors tool in its own effect — if it
still registered the stock class and ran first, the stock tool would win and the
stack fix would never load. Both registration sites now use the subclass.

## 4. Not changed

- The raw red labelmap rectangle is still what you see; there is no separate
  selection-box overlay on `main`. It now shows only the latest rectangle.
- Undo memos cover only the new fill, not the cleared pixels. The mask route
  doesn't expose undo, so this has no visible effect.
- `develop` has its own selection model (a single movable green box built from
  the bounding box of everything drawn, see `docs/masking-improvements.md` on
  that branch). This fix
  targets `main` and is independent of it.

## 5. Testing

Manual — no automated tests were added.

1. Open a stack exam in the mask route.
2. Draw a rectangle, then draw a second one elsewhere. Only the second remains.
3. Click once without dragging. The selection stays.
4. Accept. The submitted coordinates match the second rectangle.
5. Open a volume exam. Drawing several rectangles and pressing Expand behaves as
   before.

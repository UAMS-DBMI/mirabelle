# Destroyed Tool Group Fix — Implementation Notes

Moving to the next exam with Crosshairs on the left click no longer crashes the
mask route with "Cannot read properties of undefined (reading
'viewportsInfo')".

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Skip tool setup on a destroyed tool group

**Audience:** developers touching tool groups or `ToolsPanel` mounting.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/tools/toolsManager.js](../src/features/tools/toolsManager.js#L150) | Skips the setup effect when its tool group is no longer registered |

---

## 1. The problem

On IEC navigation, one React commit does all of this:

1. MaskIEC's `[iec]` effect cleanup destroys `toolGroup2d` and `toolGroup3d`
   ([MaskIEC.jsx:384](../src/features/mask/MaskIEC.jsx#L384)).
2. `ToolsPanel` remounts, because it is keyed on `iec`
   ([MaskIEC.jsx:1582](../src/features/mask/MaskIEC.jsx#L1582)). React runs
   child effects before parent effects, so `useToolsManager`'s setup effect
   ([toolsManager.js:144](../src/features/tools/toolsManager.js#L144)) runs
   next. Its `toolGroup` prop is still the group just destroyed.
3. The setup calls `disableLeftClick()`
   ([toolsManager.js:195](../src/features/tools/toolsManager.js#L195)), which
   disables whatever is on the primary button.
4. MaskIEC's effect body would then create the new groups, but never gets
   there.

Most tools don't care. `CrosshairsTool` does: its `onSetToolDisabled` looks the
group up by id (`getToolGroup(this.toolGroupId).viewportsInfo`). Between steps 1
and 4 no group with that id exists, so the lookup returns `undefined`, the
effect throws, and the error boundary replaces the page with "Oops!".

## 2. The fix

The effect now returns early when the group it was given is not the registered
one:

```js
if (ToolGroupManager.getToolGroup(toolGroup.id) !== toolGroup) return;
```

Nothing is lost. MaskIEC creates the new group and passes it down a moment
later, `[toolGroup]` changes, and the effect runs again on the live group.

## 3. Not changed

- `ToolGroupManager.destroyToolGroup` only removes the group from the registry.
  It doesn't disable its tools, so the old `CrosshairsTool` keeps its
  `VOLUME_VIEWPORT_NEW_VOLUME` listeners on the old viewport elements. Those
  elements are replaced on navigation, so this hasn't caused a visible problem.
  Disabling Crosshairs before `destroyToolGroup` would remove the listeners
  explicitly.
- The other routes destroy and recreate their tool groups the same way. The
  guard is in the shared hook, so it covers them too.

## 4. Testing

Manual — no automated tests were added.

1. Open a volume exam in the mask VR route.
2. Pick Crosshairs as the left-click tool.
3. Press Next. The next exam loads; there is no "Oops!" page.
4. On the new exam, check that the default left-click tool (Selection) is
   enabled once the image has loaded.

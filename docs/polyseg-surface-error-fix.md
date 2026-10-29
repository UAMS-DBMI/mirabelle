# PolySeg Surface Error Fix — Implementation Notes

Drawing or clearing a mask selection no longer raises "Something went wrong"
toasts from Cornerstone's `updateSurfaceData` ("Cannot read properties of
undefined (reading 'segmentationId')").

**Branch:** `all-features-develop-main` (from `fix/polyseg-update-surface-crash`
and `hide-segmentationId-error`)

**Commit:** Stop the polySeg surface error reaching the curator

**Audience:** developers touching segmentation setup or the global error
handler.

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/safePolySeg.js](../src/lib/safePolySeg.js) | Wraps the polySeg addon; skips `updateSurfaceData` when it would throw |
| [src/components/EnableCornerstone.jsx](../src/components/EnableCornerstone.jsx#L34) | Registers the wrapper as the `polySeg` addon |
| [src/lib/installGlobalErrorHandlers.js](../src/lib/installGlobalErrorHandlers.js#L47) | Backstop: no toast for the error if it still escapes |

---

## 1. The problem

When a labelmap changes, `@cornerstonejs/polymorphic-segmentation` rebuilds the
3D surface in `updateSurfaceData`. For a segment with no cached surface geometry
yet, it tries to create that geometry once per viewport holding the
segmentation, including the 2D panes, which have no Surface representation. It
then dereferences the missing representation and throws.

Two paths reach it:

- **A freshly drawn segment.** Its geometry doesn't exist yet.
- **A removed segmentation.** Clear in a volume exam removes the segmentation and
  creates a new one; the old one's surface update still fires.

The rejection happens inside the library, where no caller can catch it, so it
reached the global error handler and showed "Something went wrong". Masking
itself was unaffected.

## 2. The fix

### Skip the update that would throw

`safePolySeg` is the polySeg package with `updateSurfaceData` wrapped
([safePolySeg.js:39](../src/lib/safePolySeg.js#L39)). Before calling the real
one, `canUpdateSurfaces`
([safePolySeg.js:30](../src/lib/safePolySeg.js#L30)) checks that the
segmentation still exists and that every one of its segments already has cached
surface geometry (`segmentation_<id>_surface_<index>`). If not, the update is
skipped.

Skipping is harmless: drawn selections aren't shown as 3D surfaces (the app
draws its own box), and once every segment has geometry, updates run normally.

`EnableCornerstone` registers the wrapper instead of the raw package
([EnableCornerstone.jsx:34](../src/components/EnableCornerstone.jsx#L34)), and
`window.polyseg` points at it too.

### Backstop in the global handler

If the error still escapes by some other path, `report()` now recognizes it
([installGlobalErrorHandlers.js:47](../src/lib/installGlobalErrorHandlers.js#L47))
by its Chrome phrasing (`reading 'segmentationId'`) or Firefox phrasing
(`property "segmentationId"`). It is logged as a console warning instead of a
toast, the same way torn-down-viewport errors already are.

## 3. Sources

| Original commit | Branch | Carried over as |
|---|---|---|
| `77fd6ff` Prevent polyseg updateSurfaceData crash on newly drawn segments | `fix/polyseg-update-surface-crash` | Unchanged |
| `5393245` Don't show a toast for the known segmentationId error | `hide-segmentationId-error` | Rewritten as `isKnownPolySegError`, matching the handler's existing style |
| `aad5c89` Also don't show the error toast in Firefox | `hide-segmentationId-error` | Folded into the same helper |

The MaskIEC comment next to Clear, which said this error was not prevented,
now points at `safePolySeg`.

## 4. Testing

Manual — no automated tests were added.

1. Open a volume exam in the mask route. Draw a selection, resize it, and Clear
   it a few times.
2. No "Something went wrong" toasts appear. The console shows no
   `segmentationId` errors (or, at most, an "ignoring known polySeg surface
   error" warning).
3. Accept still submits the selection.

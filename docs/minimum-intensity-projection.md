# Minimum Intensity Projection — Implementation Notes

The View tools now offer **Minimum Intensity Projection** (MinIP) next to the
existing Maximum Intensity Projection (MIP). It renders the 2D viewports with
the darkest value along each ray instead of the brightest.

**Branch:** `minimum-intensity-projection-main` (from `main`)

**Audience:** developers touching the view modes or the 2D volume viewports.

**Modules:**

| File | Responsibility |
|---|---|
| [src/features/presentationSlice.js](../src/features/presentationSlice.js) | `ViewOptions.MIN_PROJECTION` (`"min_projection"`), the `minProjection` visibility flag, and turning it on in `setVolumeConfig` |
| [src/features/tools/toolsConfig.js](../src/features/tools/toolsConfig.js) | The View button (`dark_mode` icon) that sets `options.view` to `min_projection` |
| [src/components/VolumeViewport.jsx](../src/components/VolumeViewport.jsx) | Picks the blend mode for the current view mode and applies it |

---

## 1. Where it appears

The button shows wherever MIP shows: on volume exams, because `setVolumeConfig`
([presentationSlice.js:357](../src/features/presentationSlice.js#L357)) turns
on both flags together. That covers the mask, mask review, DICOM review and
NIfTI review routes. Stack exams use `setStackConfig`, which shows neither, so
there is no projection on a stack.

## 2. How it renders

The view-mode effect in `VolumeViewport`
([VolumeViewport.jsx:182-199](../src/components/VolumeViewport.jsx#L182-L199))
used to hard-code `MAXIMUM_INTENSITY_BLEND` for `"projection"`. It now looks up
the blend mode from the view mode:

| `options.view` | Blend mode |
|---|---|
| `projection` | `MAXIMUM_INTENSITY_BLEND` |
| `min_projection` | `MINIMUM_INTENSITY_BLEND` |
| `volume` | none — `resetProperties` / `resetToDefaultProperties`, as before |

Both projections use the same slab thickness: the volume's diagonal, so each
ray crosses the whole volume whatever the orientation. A lookup table rather
than a second `if` branch keeps the two projections from drifting apart. They
differ only in the blend, and any later change to the slab or the reset should
apply to both.

Switching directly between MIP and MinIP needs no reset: the effect sets both
the blend mode and the slab thickness each time. Going back to Volume resets
the viewport exactly as it did after MIP.

The 3D viewport is not affected; its look comes from the 3D preset (for example
`CT-MIP`), not from `options.view`.

## 3. Known limitation: full-volume slab

Because the slab spans the whole volume, the darkest sample on most rays is
air:

- **Coronal and sagittal** — every ray leaves the body in front of or behind
  the patient, so most of the image is expected to be black.
- **Axial** — rays run head to foot inside the body, so the lungs and airways
  should show. Outside the scanned circle, the CT padding value (often −2048 or
  −3024 HU) will probably fill the corners.

MinIP is clinically useful mostly on a thin slab (about 5–15 mm) for airways
and lung. If the full-volume result proves unhelpful, the next step is to give
`min_projection` its own slab thickness around the current slice instead of
the diagonal.

## 4. Not changed

- **Active button highlight.** The View button set marks the active button by
  matching `toTitleCase(options.view)` against the button name
  ([ToolsPanel.jsx:140](../src/features/tools/ToolsPanel.jsx#L140)). Neither
  projection name matches (`"Projection"` vs `"Maximum Intensity Projection"`,
  `"Min Projection"` vs `"Minimum Intensity Projection"`). This only matters
  when a route opens in a projection mode, which none do today; they all start
  in Volume.
- **Masking.** Selection, Expand and Accept do not read `options.view`, so they
  behave the same in MinIP as in MIP.

## 5. Testing

Manual — no automated tests were added.

1. Open a volume exam in the mask route. The View tools show Volume, Maximum
   Intensity Projection and Minimum Intensity Projection.
2. Click Minimum Intensity Projection. The 2D viewports switch to MinIP; the
   axial pane shows the airways and lungs.
3. Switch straight to Maximum Intensity Projection and back. Each renders
   correctly with no stale blend.
4. Click Volume. The viewports return to normal slices.
5. Open a stack exam. No projection buttons appear.

# 3D Volume Layers and Threshold — Implementation Notes

The 3D pane can now show the layers other viewers show: clothes, hair, muscle and
skeleton. Volume Opacity fades the active preset instead of replacing its curve,
four new presets reach what the existing ones don't, and a new **Threshold**
slider hides everything below a chosen value.

**Branch:** `volume-thershold-develop-main`

**Commit:** Show every layer in the 3D volume, with a threshold slider

**Audience:** developers touching the 3D presets, their sliders or how the volume
is drawn.

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/volumePresets.js](../src/lib/volumePresets.js) | The four presets, the Threshold range, and the opacity curve with a threshold applied |
| [src/components/VolumeViewport3d.jsx](../src/components/VolumeViewport3d.jsx) | `applyVolumeOpacity`: puts both sliders on the active preset's curve, and does it again after every preset change |
| [src/features/tools/ToolsPanel.jsx](../src/features/tools/ToolsPanel.jsx) | The Threshold slider, under Volume Opacity, and resetting both sliders when a preset is picked |
| [src/features/optionSlice.js](../src/features/optionSlice.js) | `volumeThreshold`, and `opacity` starting at 1 |
| [src/features/presentationSlice.js](../src/features/presentationSlice.js) | Loads the presets before building the dropdown's list, and the slider's default |

---

## 1. The symptom

No preset showed more than the skin, where other viewers also show clothes, hair,
muscle and skeleton. Moving Volume Opacity even slightly took layers away: fat
vanished and thin skin nearly did.

## 2. Root causes

### 2.1 Volume Opacity replaced the preset's curve

The first move of the slider swapped the preset's opacity curve for a fixed one:
0 at 0 HU, rising to the slider's value at 500 HU and staying there. Everything
below 0 HU became fully transparent. Exam loads and preset changes ignored the
slider, so the panel could show a value the view wasn't using.

Opacity per mm on a synthetic head in `CT-MIP`, with the slider at 0.99:

| | Fat | Skin | Muscle | Bone |
|---|---|---|---|---|
| Before | 0 | 0.08 | 0.11 | 0.99 |
| Now | 0.40 | 0.50 | 0.51 | 0.99 |

### 2.2 No preset reaches just above air

Most presets are fully transparent where thin fabric falls. `CT-MIP`, the CT
default, stays at 0 up to -637 HU. `CT-Air` and `CT-Chest-Vessels` do reach that
low, but they also draw the air, which buries fabric in fog.

A curve can't simply start lower, because a ray crosses 200 mm or more of air. Even
a small opacity on noisy air adds up to fog, so how low a curve can start depends
on each scan's air noise.

Hair is the extreme case. A hair is much thinner than a voxel, so it should average
with the air around it and land barely above -1000 HU. That is reasoning rather
than a measurement on real hair.

### 2.3 Density can't separate skin from muscle

Skin and muscle have nearly the same density, so no threshold can peel one off the
other. A curve that is opaque from just above air also hides everything behind the
first surface. Lowering its opacity doesn't help, because a flat curve fades bone
at the same rate as the tissue in front of it. `CT-Muscle` barely shows muscle
either, because fat stays hazy in front of it.

## 3. The fix

### 3.1 Both sliders work on the preset's own curve

`applyVolumeOpacity` takes the active preset from
`viewport.getProperties().preset`, applies the threshold, multiplies the result by
the opacity and writes it to the volume actor. The preset's curve decides which
tissues show, so neither slider replaces it.

Applying a preset replaces the curve, on every exam load and preset change, so the
viewport also re-applies both sliders on `Events.PRESET_MODIFIED`.

Volume Opacity now starts at 1, the preset as designed. It used to start at 0.3,
but the load ignored that value, so exams open looking the same and the panel now
shows what the view is using.

### 3.2 The Threshold slider

`thresholdedOpacityCurve` hides everything below the threshold, rises over the next
20 HU to the preset's opacity at that point, and follows the preset's curve from
there. The rise keeps a cut from being a hard edge in the middle of a tissue.
Colours stay as the preset set them, so bone stays the colour of bone wherever the
threshold is.

- **Range:** -1000 to 1500 HU in steps of 5. Air sits at -1000, so the far left
  hides nothing. The panel reads "off" there, and the curve is exactly the preset's.
- **It only hides.** It can't bring in what a preset doesn't draw, so the low end
  does nothing on `CT-MIP` (starts at -637) or `CT-Muscle-Skeleton` (starts at -60).
- **State:** `options.volumeThreshold`. Picking a preset turns it off and puts Volume
  Opacity back to 1, so each preset starts as designed. Both stay through Decimate.
  Next and Previous reset them too, along with the preset.

### 3.3 The presets

| Preset | Curve opens at | For | Air stays clean up to noise SD |
|---|---|---|---|
| `CT-All-Layers` | -900 HU | Clothes and whatever the patient lies on | about 30 HU |
| `CT-All-Layers-Hair` | -950 HU | Hair on noisier scans | about 15 HU |
| `CT-All-Layers-Hair-Max` | -980 HU | The sparsest hair | about 8 HU |
| `CT-Muscle-Skeleton` | -60 HU | Muscle and skeleton | not measured |

They are added to the front of `cornerstone.CONSTANTS.VIEWPORT_PRESETS`, which
`setPreset` looks names up in and the dropdown is built from, so every route offers
them. No exam opens in them: a CT still opens in `CT-MIP`.

What shaped the curves, for anyone tuning them:

- **No fabric density is targeted.** No published HU range for fabric was found, so
  `CT-All-Layers` relies on thin layers landing somewhere between air and soft
  tissue, and rises quickly once it clears the air.
- **Curve values act as opacity per mm,** because `scalarOpacityUnitDistance` is
  never set and stays 1. Rays cross many millimetres of tissue, which is why Volume
  Opacity does most of its work below about 0.2.
- **The hair presets rise almost as a step,** so thin clumps show strongly instead
  of fading out. Their colour ramps start dark, which sets hair apart from skin.
  `CT-All-Layers-Hair-Max` fades to black at its start, so fog barely glows against
  the black background, though it still dims whatever is behind it.
- **`CT-Muscle-Skeleton` relies on thickness.** Fat is fully transparent and soft
  tissue is faint (0.08–0.12 per mm), so thin skin is a slight veil while thick
  muscle builds up to solid colour. Bone is far more opaque (0.9), so lowering
  Volume Opacity fades muscle first and brings the skeleton through.
- **Hair and muscle stay in separate presets.** One curve doing both dimmed the skin
  behind the hair from 180 to 108 or lower.
- **Colour ramps stop at about 0.9 at bone densities.** Ambient plus diffuse reaches
  1.2 on a surface facing the camera, so brighter ramps clip most of a bone to flat
  white and lose its shape.

To see each layer, pick the preset first, because picking one resets both sliders:

| To see | Preset | Threshold | Volume Opacity |
|---|---|---|---|
| Clothes | `CT-All-Layers` | off | 1 |
| Hair and clothes | `CT-All-Layers-Hair-Max` | off | 1 |
| Muscle | `CT-Muscle-Skeleton` | off | 1 |
| Muscle and skeleton | `CT-Muscle-Skeleton` | off | about 0.5 |
| Skeleton alone | Any preset that draws bone | about 150–300 | 1 |

## 4. What was checked

The real viewer, driven headless in Chrome on synthetic NIfTI and hand-built DICOM
phantoms, with every `/papi` and `/files` call mocked, so no patient data was
involved. The renderer jitters each ray, so single pixels vary from run to run.

**Layers.** How much the picture changes (0–255) when a layer is removed from a
synthetic body, averaged over blocks of pixels. Higher means the layer is really on
screen. "Washed out" is the share of pixels clipped to white.

| Preset | Threshold | Volume Opacity | Muscle | Bone | Washed out |
|---|---|---|---|---|---|
| `CT-MIP` | off | 1 | 1 | 1 | 58% |
| `CT-MIP` | 150 | 1 | 1 | 231 | 38% |
| `CT-Muscle` | off | 1 | 8 | 1 | 0% |
| `CT-Muscle` | -50 | 1 | 54 | 1 | 0% |
| `CT-All-Layers-Hair-Max` | off | 1 | 5 | 6 | 17% |
| `CT-All-Layers-Hair-Max` | -50 | 1 | 1 | 1 | 85% |
| `CT-All-Layers-Hair-Max` | 150 | 1 | 2 | 211 | 26% |
| The same, with brighter colours at bone densities | 150 | 1 | 1 | 245 | 81% |
| `CT-Muscle-Skeleton` | off | 1 | 83 | 31 | 0% |
| `CT-Muscle-Skeleton` | off | 0.5 | 54 | 65 | 0% |
| `CT-Muscle-Skeleton` | off | 0.25 | 25 | 87 | 0% |
| `CT-Muscle-Skeleton` | 150 | 1 | 2 | 212 | 36% |

**Fabric.** Brightness (0–255) of a 2 mm sheet of known density, face-on against
black, as the range over two or three runs. Thinner sheets read fainter.

| Preset | -800 HU | -600 HU | -400 HU | -200 HU | Empty air |
|---|---|---|---|---|---|
| `CT-MIP` | 0 | 0–5 | 32–33 | 82–90 | 0 |
| `CT-Chest-Vessels` | 60–77 | 49–74 | 66–68 | 51–71 | 59–75 |
| `CT-All-Layers` | 41–44 | 121–125 | 147–154 | 167–175 | 0 |
| `CT-All-Layers-Hair` | 87–103 | 96–135 | 109–132 | 103–129 | 0 |
| `CT-All-Layers-Hair-Max` | 54–77 | 87–99 | 101–132 | 79–127 | 0 |

**Hair.** The share of a 3 mm synthetic clump's pixels clearly darker than the skin
around it, by how far the clump averages above air. This is on a 0.6 mm grid with
air noise SD 10, and readings differ by up to 7 points between runs.

| Preset | +20 HU | +40 HU | +80 HU | +160 HU |
|---|---|---|---|---|
| `CT-All-Layers` | 0% | 1% | 19% | 56% |
| `CT-All-Layers-Hair` | 25% | 54% | 92% | 98% |
| `CT-All-Layers-Hair-Max` | 73% | 93% | 99% | 99% |

**Fog.** Mean brightness (0–255) of empty air over a 224 mm path, and of the skin
behind it, by noise SD in HU. The SD is what remains after the renderer's
interpolation, about 0.54 of the SD per voxel.

| Noise SD | 3 | 5 | 8 | 10 | 15 | 20 |
|---|---|---|---|---|---|---|
| Air, `CT-All-Layers` | 0 | 0 | 0 | 0 | 0 | 0 |
| Air, `CT-All-Layers-Hair` | 0 | 0 | 0 | 0 | 3 | 17 |
| Air, `CT-All-Layers-Hair-Max` | 0 | 0 | 1 | 3 | 9 | 13 |
| Skin, `CT-All-Layers` | 192 | 192 | 193 | 192 | 192 | 192 |
| Skin, `CT-All-Layers-Hair` | 155 | 155 | 158 | 154 | 148 | 142 |
| Skin, `CT-All-Layers-Hair-Max` | 139 | 141 | 138 | 126 | 54 | 29 |

**The app,** on the mask route with synthetic DICOM:

- The curve matched the preset at every slider position tried, and the threshold cut
  exactly at 150 and -50.
- Picking a preset put both sliders back, matched the new preset's curve exactly and
  left the mask box's own opacity alone. Both sliders stayed through Decimate 50 and
  back.
- Off restored the preset's curve exactly, and Next turned the threshold off.
- The volume stayed actor 0 with the mask boxes after it, and there were no page
  errors.

**On a real exam,** checked by eye, `CT-All-Layers` showed almost everything except
fine hair, and `CT-All-Layers-Hair-Max` showed the hair as well. That was before the
colours above soft-tissue density were darkened. The Threshold slider and
`CT-Muscle-Skeleton` have not been checked on a real exam.

No automated tests were added.

## 5. Limitations

- **Muscle is the least certain layer.** Synthetic muscle is uniform, so how real
  muscle and fat planes look is unknown.
- **A low threshold on a hair preset shows skin, not muscle,** as the -50 row above
  shows. Muscle needs `CT-Muscle-Skeleton`.
- **The hair presets draw denser fabric and skin dimmer** than `CT-All-Layers`, and
  their fabric readings vary more from run to run.
- **Noisy scans fog on the hair presets.** `CT-All-Layers` stays as the clean option.
  Streaks from dental metal were not tested.
- **Only what was scanned can show.** Clothes have to be inside the field of view.
  The table, headrest, pillow and blankets show too, and can block the view.
- **The presets and the Threshold range are built for CT.** On MR or PET the
  All-Layers presets should fill the whole volume, because those values all sit above
  where the curves open, and the slider cuts raw scanner values. Neither was tested.
- **Next and Previous go back to the exam's default preset,** so the preset has to be
  picked again on each exam.
- **Dense objects such as buttons look slightly less white** than they would with
  brighter colours at bone densities.
- **Dragging the Threshold slider is coarse,** at about 10 HU per pixel. Clicking it
  and using the arrow keys steps by 5.

Found along the way and not fixed:

- **Every NIfTI opens in `MR-Angio`.** Modality detection calls
  `volume.getScalarData()`, which throws, so it falls back to MR. A CT NIfTI shows
  only bone until another preset is picked.
- **The Volume Opacity label rounds to one decimal,** though the slider steps by 0.01.

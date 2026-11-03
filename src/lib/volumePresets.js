import * as cornerstone from "@cornerstonejs/core";

// The threshold slider's range. At THRESHOLD_OFF it hides nothing: air sits at
// -1000 HU, so any cut has to start above it. The top leaves only the densest
// bone, teeth and metal.
export const THRESHOLD_OFF = -1000;
export const THRESHOLD_MAX = 1500;
export const THRESHOLD_STEP = 5;
// How far above the threshold the curve takes to reach the preset's opacity, so
// a cut isn't a hard edge in the middle of a tissue.
const THRESHOLD_RAMP = 20;

function parseOpacityCurve(preset) {
  const values = preset.scalarOpacity.split(" ").slice(1).map(parseFloat);
  const curve = [];
  for (let i = 0; i < values.length; i += 2) {
    curve.push([values[i], values[i + 1]]);
  }
  return curve;
}

function opacityAt(curve, value) {
  const nextIndex = curve.findIndex(([pointValue]) => pointValue >= value);
  if (nextIndex === -1) return curve.at(-1)[1];
  if (nextIndex === 0) return curve[0][1];

  const [value0, opacity0] = curve[nextIndex - 1];
  const [value1, opacity1] = curve[nextIndex];
  return (
    opacity0 + ((value - value0) * (opacity1 - opacity0)) / (value1 - value0)
  );
}

// The preset's opacity curve as [value, opacity] points, with everything below
// the threshold hidden. Colours stay as the preset set them, so bone stays the
// colour of bone wherever the threshold is.
export function thresholdedOpacityCurve(preset, threshold) {
  const curve = parseOpacityCurve(preset);
  if (threshold <= THRESHOLD_OFF) return curve;

  const top = threshold + THRESHOLD_RAMP;
  return [
    [Math.min(curve[0][0], threshold), 0],
    [threshold, 0],
    [top, opacityAt(curve, top)],
    ...curve.filter(([value]) => value > top),
  ];
}

// Ambient plus diffuse reaches 1.2 on a surface facing the camera, so the colour
// ramps below stay under about 0.9 at bone densities. Any brighter clips most of
// a bone to flat white, which loses the surface detail that makes a skeleton
// readable.
const MATTE_SHADING = {
  gradientOpacity: "4 0 1 255 1",
  specularPower: "1",
  specular: "0",
  shade: "1",
  ambient: "0.2",
  diffuse: "1",
  interpolation: "1",
};

// Draws everything denser than air, so clothes and whatever the patient lies on
// show up along with the body. No Cornerstone preset does this: most are fully
// transparent that far below soft tissue, and the two that aren't (CT-Air and
// CT-Chest-Vessels) also draw the air itself, which buries the rest in fog.
//
// The curve opens at -900 HU because air sits at -1000 and a ray can cross 200 mm
// or more of it, so even a small opacity on noisy air adds up to fog. It doesn't
// aim at any particular fabric's density: thin layers land anywhere between air
// and soft tissue, so the curve only has to rise quickly once it clears the air.
const ALL_LAYERS_PRESET = {
  ...MATTE_SHADING,
  name: "CT-All-Layers",
  scalarOpacity: "12 -3024 0 -900 0 -750 0.5 -400 0.7 100 0.85 3071 0.9",
  colorTransfer:
    "24 -3024 0 0 0 -900 0.6 0.42 0.28 -400 0.82 0.62 0.42 40 0.95 0.82 0.66 400 0.82 0.76 0.66 3071 0.92 0.9 0.85",
};

// Goes further than CT-All-Layers to reach hair. A hair is far thinner than a
// voxel, so it averages with the air around it and lands barely above -1000 HU.
// The curve rises almost as a step, so thin clumps show strongly instead of
// fading out, and the ramp's dark red-brown bottom sets them apart from skin.
//
// Starting this close to air is the cost: on synthetic scans the air stayed clean
// up to a noise SD of about 15 HU, against about 30 for CT-All-Layers, so a noisy
// scan fogs up here and CT-All-Layers stays as the clean option.
const ALL_LAYERS_HAIR_PRESET = {
  ...MATTE_SHADING,
  name: "CT-All-Layers-Hair",
  scalarOpacity: "8 -3024 0 -950 0 -930 0.9 3071 0.9",
  colorTransfer:
    "28 -3024 0 0 0 -960 0.4 0.18 0.1 -800 0.6 0.38 0.24 -500 0.85 0.68 0.5 40 0.96 0.84 0.7 400 0.82 0.76 0.66 3071 0.92 0.9 0.85",
};

// Goes as close to air as is workable, for the sparsest hair, which lands only a
// few tens of HU above it. The bottom of the colour ramp fades to black: fog is
// made of voxels just above the start, so it barely glows against the black
// background, while dark hair still shows on lighter skin.
//
// Fog still dims whatever is behind it: on synthetic scans skin kept its
// brightness up to a noise SD of about 8 HU, lost about 10% at 10 and about 60%
// at 15, so CT-All-Layers-Hair stays as the option for noisier scans.
const ALL_LAYERS_HAIR_MAX_PRESET = {
  ...MATTE_SHADING,
  name: "CT-All-Layers-Hair-Max",
  scalarOpacity: "8 -3024 0 -980 0 -960 0.9 3071 0.9",
  colorTransfer:
    "32 -3024 0 0 0 -980 0 0 0 -940 0.35 0.16 0.09 -800 0.6 0.38 0.24 -500 0.85 0.68 0.5 40 0.96 0.84 0.7 400 0.82 0.76 0.66 3071 0.92 0.9 0.85",
};

// Shows muscle and skeleton together. Skin and muscle have nearly the same
// density, so no threshold can separate them. What does is thickness: fat is
// fully transparent, and soft tissue is faint enough that thin skin is a slight
// veil while thick muscle builds up to solid colour. Bone is far more opaque than
// soft tissue, so lowering the opacity slider fades muscle first and brings the
// skeleton through. The threshold slider at about 150 leaves the skeleton alone.
const MUSCLE_SKELETON_PRESET = {
  ...MATTE_SHADING,
  name: "CT-Muscle-Skeleton",
  scalarOpacity: "12 -3024 0 -60 0 20 0.08 120 0.12 250 0.9 3071 0.9",
  colorTransfer:
    "28 -3024 0 0 0 -60 0.55 0.2 0.12 40 0.72 0.28 0.2 120 0.85 0.45 0.3 250 0.85 0.76 0.62 600 0.88 0.82 0.72 3071 0.92 0.9 0.85",
};

// Viewports look presets up by name in this array and the preset dropdown is
// built from it, so adding the presets here offers them on every route.
cornerstone.CONSTANTS.VIEWPORT_PRESETS.unshift(
  ALL_LAYERS_PRESET,
  ALL_LAYERS_HAIR_PRESET,
  ALL_LAYERS_HAIR_MAX_PRESET,
  MUSCLE_SKELETON_PRESET,
);

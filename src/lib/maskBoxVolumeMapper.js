/**
 * A cornerstone plugin that renders the mask selection box's glass fill
 * inside the volume ray march itself, driven by shader uniforms.
 *
 * The previous fill implementation interleaved a second voxel component into
 * the volume's data. That was depth-correct but paid for it in memory: a
 * two-component float copy of the whole volume on the CPU and again as the
 * GPU texture — which doubled render bandwidth, made every fill move a
 * texture upload, and hit a hard wall on large exams (a 516-slice CT needs
 * ~1 GB, which WebGL fails to allocate SILENTLY, leaving a zero-filled
 * texture and a grey volume). This plugin keeps the fill's correctness — the
 * box is still evaluated per ray sample, so anatomy in front occludes it,
 * anatomy inside shows through it, and it fades what's behind it — with the
 * box described by six floats instead of a billion voxels:
 *
 *   - zero extra CPU or GPU memory, so it works on every exam size;
 *   - moving the box costs one uniform update + re-render — no voxel
 *     writes, no uploads;
 *   - the anatomy keeps rendering through cornerstone's shared streaming
 *     texture, untouched.
 *
 * How it plugs in — the same extension seams cornerstone itself uses:
 *
 *   1. A renderable mapper class (vtkMaskBoxVolumeMapper) that presents as a
 *      vtkSharedVolumeMapper subclass carrying the box parameters.
 *   2. An OpenGL view node (vtkMaskBoxOpenGLVolumeMapper) extending
 *      cornerstone's vtkStreamingOpenGLVolumeMapper. It patches the volume
 *      fragment shader template at build time: vtk's getColorForValue() —
 *      the one function every blend mode calls per sample, with the sample
 *      position in hand — is renamed and wrapped by a version that blends
 *      the box shell over the sample's color.
 *   3. A registerOverride() call mapping class 1 to node 2 in the streaming
 *      view-node factory, exactly how 'vtkSharedVolumeMapper' itself is
 *      mapped to its streaming node.
 *
 * Degradation is safe by construction: a factory that doesn't know the
 * class walks up the hierarchy and renders it as a plain shared mapper
 * (anatomy fine, no fill), and if the shader template ever stops matching
 * the expected anchors the patch backs off and only the fill is lost.
 */

import macro from "@kitware/vtk.js/macros";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";

// These two are not in @cornerstonejs/core's exports map, so they are
// reached as files. Webpack resolves relative paths without consulting the
// exports map and dedupes them against cornerstone's own imports by absolute
// path — so registerOverride() below writes into the very CLASS_MAPPING the
// engine's live view-node factories read from.
import vtkStreamingOpenGLVolumeMapper from "../../node_modules/@cornerstonejs/core/dist/esm/RenderingEngine/vtkClasses/vtkStreamingOpenGLVolumeMapper";
import { registerOverride } from "../../node_modules/@cornerstonejs/core/dist/esm/RenderingEngine/vtkClasses/vtkStreamingOpenGLViewNodeFactory";

const RENDERABLE_CLASS = "vtkMaskBoxVolumeMapper";

// Everything off; also what getMaskBoxParams reports before any box is set.
const DISABLED_PARAMS = Object.freeze({
  enabled: false,
  boxMin: [0, 0, 0],
  boxMax: [0, 0, 0],
  thickness: [0, 0, 0],
  color: [0, 1, 0],
  alpha: 0,
  coreAlpha: 0,
  faceShade: [1, 1, 1],
  edgeBoost: 0,
  edgeThickness: [0, 0, 0],
});

// ---------------------------------------------------------------------------
// Fragment shader patch
// ---------------------------------------------------------------------------

// The exact signature of the per-sample color function in vtk.js's
// vtkVolumeFS.glsl (pinned by the lockfile). It appears once, as the
// definition; every blend mode calls it with posIS in NORMALIZED texture
// coordinates (it is passed straight to texture()), which is what makes the
// box test a plain bounds comparison.
const COLOR_FN_SIGNATURE =
  "vec4 getColorForValue(vec4 tValue, vec3 posIS, vec3 tstep)";

const COLOR_FN_IMPL = "maskBoxColorForValueImpl";

// The wrapper is inserted before this declaration: it sits at global scope
// OUTSIDE every preprocessor conditional, after getColorForValue's body ends,
// and before every call site — so the wrapper always survives preprocessing,
// sees the renamed implementation above it, and shadows the name for all
// callers below. (The seemingly-obvious anchor after it,
// checkOnEdgeForNeighbor, lives inside `#if vtkBlendMode == 6` — anchoring
// there compiled ONLY under that blend mode and left getColorForValue
// undefined under every real preset.)
const INSERT_ANCHOR = "bool valueWithinScalarRange(";

// The wrapper blends the shell "over" the sample in straight (unpremultiplied)
// alpha — the convention the blend loops consume — so the pane is visible
// over empty space, tints anatomy inside the volume, and reads fully solid at
// alpha 1. The shell is the region within maskBoxThickness of any box face.
// Under MIP-style blends only the winning sample is colored, so the fill is
// faint there by nature; the wireframe box still delineates the selection.
const WRAPPER_SOURCE = `
uniform int maskBoxEnabled;
uniform vec3 maskBoxMin;
uniform vec3 maskBoxMax;
uniform vec3 maskBoxThickness;
uniform vec3 maskBoxColor;
uniform float maskBoxAlpha;
uniform float maskBoxCoreAlpha;
uniform vec3 maskBoxFaceShade;
uniform float maskBoxEdgeBoost;
uniform vec3 maskBoxEdgeThickness;

// Injected by mirabelle's mask-box plugin (src/lib/maskBoxVolumeMapper.js).
vec4 getColorForValue(vec4 tValue, vec3 posIS, vec3 tstep)
{
  vec4 color = ${COLOR_FN_IMPL}(tValue, posIS, tstep);
  if (maskBoxEnabled == 0) { return color; }

  vec3 lo = posIS - maskBoxMin;
  vec3 hi = maskBoxMax - posIS;
  if (any(lessThan(lo, vec3(0.0))) || any(lessThan(hi, vec3(0.0)))) { return color; }

  // Distance to the nearest face along each axis, and which of those we are
  // close enough to be standing in the glass of.
  vec3 dist = min(lo, hi);
  vec3 inShell = step(dist, maskBoxThickness);
  float shellAxes = inShell.x + inShell.y + inShell.z;

  vec3 paneColor;
  float alpha;
  if (shellAxes < 1.0) {
    // Hollow middle of the box. It only participates near the top of the
    // opacity slider, where the box stops being a preview of WHERE the mask
    // sits and becomes a preview of WHAT the mask does — the anatomy inside
    // is about to be removed, so it gets filled in and blocked out. Kept
    // faint per sample because a ray crosses hundreds of interior samples.
    if (maskBoxCoreAlpha <= 0.0) { return color; }
    paneColor = maskBoxColor * 0.7;
    alpha = maskBoxCoreAlpha;
  } else {
    // Dimensional shading: each pair of opposing faces gets its own
    // brightness, the way an isometric cube illustration shades its three
    // visible sides. Without this every face is the same flat green and the
    // box reads as a silhouette rather than a solid with form.
    float shade = max(max(inShell.x * maskBoxFaceShade.x,
                          inShell.y * maskBoxFaceShade.y),
                      inShell.z * maskBoxFaceShade.z);

    // Two overlapping faces means we are along one of the 12 edges (three
    // means a corner). Edges get lifted toward white and made denser, which
    // is what gives the box a crisp drawn outline instead of a soft blob.
    //
    // The edge band is measured against its OWN thickness, not the pane's.
    // Reusing the pane thickness made every edge as wide as the glass is
    // deep (a maskBoxThickness-square prism down each of the 12 edges), which
    // on a low-resolution or decimated volume is several screen pixels of
    // bright green — the box read as chunky rather than crisply outlined.
    vec3 inEdge = step(dist, maskBoxEdgeThickness);
    float edge = clamp(inEdge.x + inEdge.y + inEdge.z - 1.0, 0.0, 1.0);
    paneColor = clamp(maskBoxColor * shade + vec3(edge * maskBoxEdgeBoost), 0.0, 1.0);
    alpha = clamp(maskBoxAlpha * (1.0 + edge), 0.0, 1.0);
  }

  float outAlpha = alpha + color.a * (1.0 - alpha);
  if (outAlpha <= 0.0) { return color; }
  color.rgb = (paneColor * alpha + color.rgb * color.a * (1.0 - alpha)) / outAlpha;
  color.a = outAlpha;
  return color;
}
`;

let warnedPatchFailed = false;

// Returns the patched fragment source, or null when the template no longer
// matches (e.g. a vtk.js upgrade rewrote the shader) — callers then render
// unpatched: anatomy intact, fill off.
function patchVolumeFragmentSource(source) {
  if (
    !source?.includes(COLOR_FN_SIGNATURE) ||
    !source.includes(INSERT_ANCHOR)
  ) {
    return null;
  }
  return source
    .replace(
      COLOR_FN_SIGNATURE,
      `vec4 ${COLOR_FN_IMPL}(vec4 tValue, vec3 posIS, vec3 tstep)`,
    )
    .replace(INSERT_ANCHOR, `${WRAPPER_SOURCE}\n${INSERT_ANCHOR}`);
}

// ---------------------------------------------------------------------------
// Renderable mapper
// ---------------------------------------------------------------------------

function vtkMaskBoxVolumeMapperClass(publicAPI, model) {
  // Present as a vtkSharedVolumeMapper subclass: cornerstone type checks
  // (isA) keep passing, and a factory that doesn't know this class falls
  // back to the stock streaming node — anatomy renders, fill is simply off.
  model.classHierarchy.push("vtkSharedVolumeMapper");
  model.classHierarchy.push(RENDERABLE_CLASS);

  model.maskBoxParams = DISABLED_PARAMS;

  // Deliberately NOT macro.setGet: setting box params must not bump the
  // mapper's mtime, or getNeedToRebuildShaders would re-run the whole shader
  // substitution pass on every drag tick. Callers trigger the render
  // explicitly, and the GL node reads the params fresh each frame.
  publicAPI.setMaskBoxParams = (params) => {
    model.maskBoxParams = params || DISABLED_PARAMS;
  };
  publicAPI.getMaskBoxParams = () => model.maskBoxParams;
}

function extendRenderable(publicAPI, model, initialValues = {}) {
  vtkVolumeMapper.extend(publicAPI, model, initialValues);
  model.scalarTexture = model.scalarTexture ?? null;
  macro.setGet(publicAPI, model, ["scalarTexture"]);
  vtkMaskBoxVolumeMapperClass(publicAPI, model);
}

export const vtkMaskBoxVolumeMapper = {
  newInstance: macro.newInstance(extendRenderable, RENDERABLE_CLASS),
  extend: extendRenderable,
};

// ---------------------------------------------------------------------------
// OpenGL view node
// ---------------------------------------------------------------------------

function vtkMaskBoxOpenGLVolumeMapperClass(publicAPI, model) {
  model.classHierarchy.push("vtkMaskBoxOpenGLVolumeMapper");

  const superGetShaderTemplate = publicAPI.getShaderTemplate;
  publicAPI.getShaderTemplate = (shaders, ren, actor) => {
    superGetShaderTemplate(shaders, ren, actor);
    // After a GPU compile failure the patch stays off for good — anatomy
    // rendering always outranks the fill.
    const patched = model.maskBoxCompileFailed
      ? null
      : patchVolumeFragmentSource(shaders.Fragment);
    model.maskBoxShaderPatched = Boolean(patched);
    if (patched) {
      shaders.Fragment = patched;
    } else if (!model.maskBoxCompileFailed && !warnedPatchFailed) {
      warnedPatchFailed = true;
      console.warn(
        "[maskBoxVolumeMapper] vtk volume shader template did not match — " +
          "rendering without the 3D box fill",
      );
    }
  };

  // Self-healing around shader builds. If the patched shader fails to
  // compile, vtk's shader cache returns null, the cell's program stays null,
  // and every render after that crashes on the null program (seen in the
  // wild as "Cannot read properties of null (reading 'isAttributeUsed')").
  // Two nets, either of which drops the patch and rebuilds stock:
  //
  //  1. Catch the throw the first failing frame produces, flag the failure,
  //     and rebuild immediately within the same call — the frame renders
  //     (without the fill) instead of aborting.
  //  2. If a build ever leaves a null program without throwing, force a
  //     rebuild instead of letting vtk march into the null.
  const superUpdateShaders = publicAPI.updateShaders;
  publicAPI.updateShaders = (cellBO, ren, actor) => {
    try {
      superUpdateShaders(cellBO, ren, actor);
    } catch (error) {
      if (!model.maskBoxShaderPatched || model.maskBoxCompileFailed) {
        throw error;
      }
      model.maskBoxCompileFailed = true;
      console.warn(
        "[maskBoxVolumeMapper] patched volume shader failed to build — " +
          "rendering without the 3D box fill. The vtk compile error above " +
          "has the shader line that failed.",
        error,
      );
      // Outdate the cell's shader source time so the retry actually rebuilds
      // (now unpatched, via the maskBoxCompileFailed gate above).
      publicAPI.modified();
      superUpdateShaders(cellBO, ren, actor);
    }
  };

  const superGetNeedToRebuildShaders = publicAPI.getNeedToRebuildShaders;
  publicAPI.getNeedToRebuildShaders = (cellBO, ren, actor) => {
    const needed = superGetNeedToRebuildShaders(cellBO, ren, actor);
    if (!needed && !cellBO.getProgram()) {
      if (model.maskBoxShaderPatched && !model.maskBoxCompileFailed) {
        model.maskBoxCompileFailed = true;
        console.warn(
          "[maskBoxVolumeMapper] volume shader build produced no program — " +
            "rendering without the 3D box fill",
        );
      }
      // Never report "no rebuild needed" while there is no program to run.
      return true;
    }
    return needed;
  };

  const superBuildBufferObjects = publicAPI.buildBufferObjects;
  publicAPI.buildBufferObjects = (ren, actor) => {
    // The streaming factory only injects the shared scalar texture for the
    // exact 'vtkSharedVolumeMapper' class name; for this class it arrives on
    // the renderable instead (ensureMaskBoxMapper copies it there).
    if (!model.scalarTexture) {
      model.scalarTexture = model.renderable?.getScalarTexture?.() ?? null;
    }
    superBuildBufferObjects(ren, actor);
  };

  const superSetMapperShaderParameters = publicAPI.setMapperShaderParameters;
  publicAPI.setMapperShaderParameters = (cellBO, ren, actor) => {
    superSetMapperShaderParameters(cellBO, ren, actor);
    if (!model.maskBoxShaderPatched) {
      return;
    }
    const program = cellBO.getProgram();
    const params = model.renderable?.getMaskBoxParams?.();
    if (!params?.enabled) {
      program.setUniformi("maskBoxEnabled", 0);
      return;
    }
    program.setUniformi("maskBoxEnabled", 1);
    program.setUniform3f(
      "maskBoxMin",
      params.boxMin[0],
      params.boxMin[1],
      params.boxMin[2],
    );
    program.setUniform3f(
      "maskBoxMax",
      params.boxMax[0],
      params.boxMax[1],
      params.boxMax[2],
    );
    program.setUniform3f(
      "maskBoxThickness",
      params.thickness[0],
      params.thickness[1],
      params.thickness[2],
    );
    program.setUniform3f(
      "maskBoxColor",
      params.color[0],
      params.color[1],
      params.color[2],
    );
    program.setUniformf("maskBoxAlpha", params.alpha);
    program.setUniformf("maskBoxCoreAlpha", params.coreAlpha);
    program.setUniform3f(
      "maskBoxFaceShade",
      params.faceShade[0],
      params.faceShade[1],
      params.faceShade[2],
    );
    program.setUniformf("maskBoxEdgeBoost", params.edgeBoost);
    program.setUniform3f(
      "maskBoxEdgeThickness",
      params.edgeThickness[0],
      params.edgeThickness[1],
      params.edgeThickness[2],
    );
  };
}

function extendOpenGLNode(publicAPI, model, initialValues = {}) {
  vtkStreamingOpenGLVolumeMapper.extend(publicAPI, model, initialValues);
  vtkMaskBoxOpenGLVolumeMapperClass(publicAPI, model);
}

export const vtkMaskBoxOpenGLVolumeMapper = {
  newInstance: macro.newInstance(extendOpenGLNode, "vtkMaskBoxOpenGLVolumeMapper"),
  extend: extendOpenGLNode,
};

// Module-load registration, mirroring how cornerstone maps
// 'vtkSharedVolumeMapper' to its streaming node. CLASS_MAPPING is shared by
// reference with every factory instance the engine has already created, so
// this also covers viewports enabled before this module loaded.
registerOverride(RENDERABLE_CLASS, vtkMaskBoxOpenGLVolumeMapper.newInstance);

// ---------------------------------------------------------------------------
// Actor integration
// ---------------------------------------------------------------------------

/**
 * Make sure the given volume actor renders through the mask-box mapper,
 * swapping its shared streaming mapper for one of ours on first use (all
 * settings and the shared scalar texture carry over — the anatomy keeps
 * rendering from the texture it already uploaded). Returns the mask-box
 * mapper, or null when the actor's mapper isn't the expected kind.
 */
export function ensureMaskBoxMapper(volumeActor) {
  const current = volumeActor?.getMapper?.();
  if (!current) {
    return null;
  }
  if (current.isA?.(RENDERABLE_CLASS)) {
    return current;
  }
  if (!current.isA?.("vtkSharedVolumeMapper")) {
    // Some other mapper kind (CPU fallback, a future cornerstone change) —
    // leave it alone rather than break the anatomy render.
    return null;
  }
  if (!current.getScalarTexture?.()) {
    // No shared texture to carry over (volume still setting up) — swapping
    // now would leave the streaming node with nothing to bind. Callers retry
    // on the next selection refresh.
    return null;
  }

  const mapper = vtkMaskBoxVolumeMapper.newInstance();
  mapper.setInputData(current.getInputData());
  mapper.setScalarTexture(current.getScalarTexture());
  mapper.setBlendMode(current.getBlendMode());
  mapper.setSampleDistance(current.getSampleDistance());
  mapper.setMaximumSamplesPerRay(current.getMaximumSamplesPerRay());
  if (current.getPreferSizeOverAccuracy?.()) {
    mapper.setPreferSizeOverAccuracy?.(true);
  }
  volumeActor.setMapper(mapper);
  return mapper;
}

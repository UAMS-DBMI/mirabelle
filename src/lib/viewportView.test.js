import { acquisitionPaneOrientation } from "./viewportView";

// Cornerstone's world-space MPR cameras (patient LPS) — what every pane must
// produce for any volume whose voxel axes align with the patient axes,
// regardless of how those axes are ordered or signed in the direction matrix.
const WORLD_CAMERAS = {
  AXIAL: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
  SAGITTAL: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
  CORONAL: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
};

const PANES = Object.keys(WORLD_CAMERAS);

function volumeWithDirection(direction) {
  return { direction };
}

function expectVectorClose(actual, expected) {
  expect(actual).toHaveLength(3);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 6);
  });
}

describe("acquisitionPaneOrientation", () => {
  it("returns the world MPR cameras for an axis-aligned volume", () => {
    const volume = volumeWithDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    PANES.forEach((pane) => {
      const result = acquisitionPaneOrientation(volume, pane);
      expectVectorClose(
        result.viewPlaneNormal,
        WORLD_CAMERAS[pane].viewPlaneNormal,
      );
      expectVectorClose(result.viewUp, WORLD_CAMERAS[pane].viewUp);
    });
  });

  it("normalizes direction rows scaled away from unit length", () => {
    const volume = volumeWithDirection([2, 0, 0, 0, 2, 0, 0, 0, 2]);
    const result = acquisitionPaneOrientation(volume, "AXIAL");
    expectVectorClose(result.viewPlaneNormal, [0, 0, -1]);
    expectVectorClose(result.viewUp, [0, -1, 0]);
  });

  it("keeps anatomical cameras for a volume with flipped (RAS-style) axes", () => {
    // NIfTI affines commonly negate x/y relative to LPS. The panes must not
    // come out mirrored or upside-down.
    const volume = volumeWithDirection([-1, 0, 0, 0, -1, 0, 0, 0, 1]);
    PANES.forEach((pane) => {
      const result = acquisitionPaneOrientation(volume, pane);
      expectVectorClose(
        result.viewPlaneNormal,
        WORLD_CAMERAS[pane].viewPlaneNormal,
      );
      expectVectorClose(result.viewUp, WORLD_CAMERAS[pane].viewUp);
    });
  });

  it("keeps anatomical cameras for a sagittally acquired volume", () => {
    // Sagittal acquisition: voxel i runs A→P, j runs S→I, k runs R→L. The
    // axial pane must still show an axial view (normal along the voxel that
    // runs inferior), not the acquisition plane.
    const volume = volumeWithDirection([0, 1, 0, 0, 0, -1, 1, 0, 0]);
    PANES.forEach((pane) => {
      const result = acquisitionPaneOrientation(volume, pane);
      expectVectorClose(
        result.viewPlaneNormal,
        WORLD_CAMERAS[pane].viewPlaneNormal,
      );
      expectVectorClose(result.viewUp, WORLD_CAMERAS[pane].viewUp);
    });
  });

  it("follows the tilted voxel axes for a gantry-tilted axial volume", () => {
    const theta = (10 * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // Rotation about the voxel i axis: j and k lean by theta.
    const volume = volumeWithDirection([1, 0, 0, 0, cos, sin, 0, -sin, cos]);
    const result = acquisitionPaneOrientation(volume, "AXIAL");
    // Snaps to the tilted -k / -j axes, not the world axes: the slice renders
    // square-on to the voxel grid (the original tilted-image fix).
    expectVectorClose(result.viewPlaneNormal, [0, sin, -cos]);
    expectVectorClose(result.viewUp, [0, -cos, -sin]);
  });

  it("never assigns the same voxel axis to the normal and the up", () => {
    // 45° tie about i: the up's best axis (j) is taken by the normal only if
    // the normal picked it first; the up must fall back to a different axis.
    const s = Math.SQRT1_2;
    const volume = volumeWithDirection([1, 0, 0, 0, s, s, 0, -s, s]);
    PANES.forEach((pane) => {
      const result = acquisitionPaneOrientation(volume, pane);
      const dot = result.viewPlaneNormal.reduce(
        (sum, component, index) => sum + component * result.viewUp[index],
        0,
      );
      expect(Math.abs(dot)).toBeCloseTo(0, 6);
    });
  });

  // Independent per-pane snapping would give two panes the same voxel axis on
  // these volumes (duplicate view, one axis unviewable); the joint assignment
  // must keep the three panes on three mutually orthogonal voxel axes.
  const OBLIQUE_DIRECTIONS = {
    // 90° rotation about (1,1,0)/√2: voxel k is the closest axis to both the
    // patient x and y axes.
    "diagonal 90° rotation": [
      0.5,
      0.5,
      -Math.SQRT1_2,
      0.5,
      0.5,
      Math.SQRT1_2,
      Math.SQRT1_2,
      -Math.SQRT1_2,
      0,
    ],
    // Voxel i dominates both the patient x and y axes.
    "double-oblique (i dominates x and y)": [
      0.8, 0.6, 0, -0.424, 0.566, 0.707, 0.424, -0.566, 0.707,
    ],
    // 45° tie about i (the fixture above): j and k tie for the axial normal.
    "45° tilt about i": [
      1,
      0,
      0,
      0,
      Math.SQRT1_2,
      Math.SQRT1_2,
      0,
      -Math.SQRT1_2,
      Math.SQRT1_2,
    ],
  };

  Object.entries(OBLIQUE_DIRECTIONS).forEach(([name, direction]) => {
    it(`slices three distinct voxel axes for an oblique volume (${name})`, () => {
      const volume = volumeWithDirection(direction);
      const normals = PANES.map(
        (pane) => acquisitionPaneOrientation(volume, pane).viewPlaneNormal,
      );
      for (let a = 0; a < normals.length; a += 1) {
        for (let b = a + 1; b < normals.length; b += 1) {
          const dot = normals[a].reduce(
            (sum, component, index) => sum + component * normals[b][index],
            0,
          );
          expect(Math.abs(dot)).toBeCloseTo(0, 3);
        }
      }
    });
  });

  it("accepts a Float32Array direction (as Cornerstone provides)", () => {
    const volume = volumeWithDirection(
      new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    );
    const result = acquisitionPaneOrientation(volume, "CORONAL");
    expectVectorClose(result.viewPlaneNormal, [0, -1, 0]);
    expectVectorClose(result.viewUp, [0, 0, 1]);
  });

  it("returns null for missing or malformed input", () => {
    expect(acquisitionPaneOrientation(null, "AXIAL")).toBeNull();
    expect(acquisitionPaneOrientation({}, "AXIAL")).toBeNull();
    expect(
      acquisitionPaneOrientation(volumeWithDirection([1, 0, 0]), "AXIAL"),
    ).toBeNull();
    expect(
      acquisitionPaneOrientation(
        volumeWithDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        "OBLIQUE",
      ),
    ).toBeNull();
    // Degenerate (zero-length) axis row.
    expect(
      acquisitionPaneOrientation(
        volumeWithDirection([1, 0, 0, 0, 0, 0, 0, 0, 1]),
        "AXIAL",
      ),
    ).toBeNull();
  });
});

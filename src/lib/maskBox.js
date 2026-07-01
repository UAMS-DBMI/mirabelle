/**
 * Renders the masking selection as a box in a 3D viewport.
 *
 * The mask labelmap always fills the selection's IJK bounding box edge-to-edge,
 * so the masked region is a box. We draw that box as an explicit vtk actor
 * rather than deriving a surface from the labelmap. This decouples the 3D
 * preview from the labelmap, which lets the labelmap (and the submitted mask)
 * reach the very edge of the volume — a labelmap-derived surface can't, because
 * marching cubes produces no isosurface for a region touching the grid edge.
 */

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";

// Stable id so the box can be found, replaced, and removed on a viewport.
const MASK_BOX_ACTOR_UID = "mask-selection-box";

// The 8 corners of a cube as (i, j, k) ∈ {0, 1} offsets, where 0 picks the
// low (min) face and 1 the high (max) face along that axis.
const CUBE_CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

// The 6 quad faces, each as 4 indices into CUBE_CORNERS (wound consistently).
const CUBE_FACES = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [1, 2, 6, 5],
  [0, 3, 7, 4],
];

/**
 * World-space positions of the box's 8 corners, as a flat [x,y,z,...] array.
 *
 * The IJK bounds are voxel indices, so we expand by half a voxel on each side
 * to put the faces on voxel boundaries — that way the box reaches the true edge
 * of the volume when the selection spans it. indexToWorld applies the volume's
 * origin/spacing/direction, so the box stays aligned even for oblique volumes.
 */
function boxCornerPoints(imageData, coords) {
  const lo = [coords.i.min - 0.5, coords.j.min - 0.5, coords.k.min - 0.5];
  const hi = [coords.i.max + 0.5, coords.j.max + 0.5, coords.k.max + 0.5];

  const points = new Float32Array(CUBE_CORNERS.length * 3);
  CUBE_CORNERS.forEach(([ci, cj, ck], index) => {
    const ijk = [ci ? hi[0] : lo[0], cj ? hi[1] : lo[1], ck ? hi[2] : lo[2]];
    const world = imageData.indexToWorld(ijk, [0, 0, 0]);
    points.set(world, index * 3);
  });
  return points;
}

// vtk cell array format: each face is prefixed with its vertex count.
function boxFaceCells() {
  const cells = [];
  CUBE_FACES.forEach((face) => cells.push(face.length, ...face));
  return Uint16Array.from(cells);
}

/**
 * Add (or replace) the selection box on a 3D viewport.
 *
 * @param {object} viewport A cornerstone VOLUME_3D viewport.
 * @param {object} volume The cornerstone volume the box is measured against
 *   (its imageData defines the IJK→world transform).
 * @param {{i,j,k}} coords IJK min/max bounds (from getLabelmapBounds).
 * @param {{color?: [number,number,number], opacity?: number}} [options]
 */
export function addMaskBox(viewport, volume, coords, options = {}) {
  const {
    color = [0.3, 0.85, 0.3],
    opacity = 0.8,
    edgeColor = [0.6, 1, 0.6],
    edgeWidth = 2,
  } = options;

  removeMaskBox(viewport);

  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(boxCornerPoints(volume.imageData, coords), 3);
  polyData.getPolys().setData(boxFaceCells());

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const property = actor.getProperty();
  property.setColor(...color);
  property.setOpacity(opacity);
  // Draw the 12 box edges so the box reads clearly through the translucent
  // fill. (vtk has no rounded-cube primitive, so the corners stay square; the
  // visible edges are what make it look like a deliberate box rather than a
  // flat slab.)
  property.setEdgeVisibility(true);
  property.setEdgeColor(...edgeColor);
  property.setLineWidth(edgeWidth);

  viewport.addActor({ uid: MASK_BOX_ACTOR_UID, actor });
  viewport.render();
}

/** Remove the selection box from a 3D viewport, if present. */
export function removeMaskBox(viewport) {
  if (!viewport.getActor(MASK_BOX_ACTOR_UID)) {
    return;
  }
  viewport.removeActors([MASK_BOX_ACTOR_UID]);
  viewport.render();
}

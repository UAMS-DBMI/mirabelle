import * as math from "mathjs";

import { requestJSON } from "@/lib/http";
import { messages } from "@/lib/messages";

/*
 * Functions related to masking
 */

// TODO experiment for singleton value
export let loaded = { loaded: false };

export async function getMaskingDetails(iec) {
  return requestJSON(`/papi/v1/masking/${iec}`, undefined, {
    errorMessage: messages.errors.loadImage,
  });
}

export async function flagForMasking(iec) {
  return requestJSON(
    `/papi/v1/masking/${iec}/mask`,
    { method: "POST" },
    { errorMessage: messages.errors.saveStatus },
  );
}

const MASKING_STATUS_PATHS = {
  "accept mask": "accept",
  "reject mask": "reject",
  "skip mask": "skip",
  "nonmaskable mask": "nonmaskable",
};

export async function setMaskingStatus(iec, status) {
  const action = MASKING_STATUS_PATHS[status];
  if (!action) {
    throw new Error(`Unknown masking status: ${status}`);
  }

  return requestJSON(
    `/papi/v1/masking/${iec}/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    { errorMessage: messages.errors.saveStatus },
  );
}

export async function setParameters(
  iec,
  {
    lr,
    pa,
    is,
    width,
    height,
    depth,
    form,
    function: maskFunction,
    noise,
    fill,
  },
) {
  // The api expects lr,pa,is to be capitalized
  const body = JSON.stringify({
    LR: lr,
    PA: pa,
    IS: is,
    width,
    height,
    depth,
    form,
    function: maskFunction === "slice_remove" ? "sliceremove" : maskFunction,
    noise,
    fill,
  });
  // console.log("setParameters", body);

  return requestJSON(
    `/papi/v1/masking/${iec}/parameters`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    },
    { errorMessage: messages.errors.submitMask },
  );
}

export async function tests() {
  const iec = 3;

  // console.log("getDetails");
  // console.log(await getDetails(iec));

  // console.log("flagForMasking");
  // console.log(await flagForMasking(iec));

  // console.log("setParameters");
  let lr = 212;
  let pa = 47;
  let s = 24;
  let i = 1;
  let d = 200;
  // console.log(await setParameters(iec, { lr, pa, s, i, d }));

  // console.log("getFiles");
  // console.log(await getFiles(iec));

  // console.log("getIECsForVR");
  // console.log(await getIECsForVR(1));
}

export async function submitFinalCoords(
  coords,
  spacing,
  iec,
  maskForm,
  maskFunction,
  maskNoise,
  maskFill,
) {
  //// single image
  //// iec = 1167702
  //coords = {
  //  "i": { "min": 180, "max": 329 },
  //  "j": { "min": 114, "max": 412 },
  //  "k": { "min": 0, "max": 0 }
  //}

  //// orthogonal
  //// iec = 1170774
  //coords = {
  //  "i": { "min": 139, "max": 406 },
  //  "j": { "min": 36, "max": 311 },
  //  "k": { "min": 630, "max": 860 }
  //}

  //// non-orthogonal image
  //// iec = 1219121
  //coords = {
  //  "i": { "min": 0, "max": 340 },
  //  "j": { "min": 0, "max": 312 },
  //  "k": { "min": 12, "max": 64 }
  //}

  // Define the 8 corners of the cuboid in the source voxel space
  const sourceVoxelCorners = [
    [coords.i.min, coords.j.min, coords.k.min], // Bottom-front-left corner
    [coords.i.min, coords.j.min, coords.k.max], // Bottom-front-right corner
    [coords.i.min, coords.j.max, coords.k.min], // Top-front-left corner
    [coords.i.min, coords.j.max, coords.k.max], // Top-front-right corner
    [coords.i.max, coords.j.min, coords.k.min], // Bottom-back-left corner
    [coords.i.max, coords.j.min, coords.k.max], // Bottom-back-right corner
    [coords.i.max, coords.j.max, coords.k.min], // Top-back-left corner
    [coords.i.max, coords.j.max, coords.k.max], // Top-back-right corner
  ];

  // Compute min/max in target space
  const sourceMin = [0, 1, 2].map((ax) =>
    Math.floor(Math.min(...sourceVoxelCorners.map((c) => c[ax]))),
  );
  const sourceMax = [0, 1, 2].map((ax) =>
    Math.ceil(Math.max(...sourceVoxelCorners.map((c) => c[ax]))),
  );

  const ijkOutput = [
    Math.round(sourceMin[0]) | 0,
    Math.round(sourceMax[0]) | 0,
    Math.round(sourceMin[1]) | 0,
    Math.round(sourceMax[1]) | 0,
    Math.round(sourceMin[2]) | 0,
    Math.round(sourceMax[2]) | 0,
  ];

  // Convert sourceMin and sourceMax to physical coordinates using only source spacing
  const sourceMinMM = math.dotMultiply(sourceMin, spacing);
  const sourceMaxMM = math.dotMultiply(sourceMax, spacing);

  // Compute center and dimensions in physical space
  const centerMM = math.dotDivide(math.add(sourceMinMM, sourceMaxMM), 2);
  const dimensionsMM = math.subtract(sourceMaxMM, sourceMinMM);

  const output = {
    lr: Math.round(centerMM[0]), // LR (R = +, L = -)
    pa: Math.round(centerMM[1]), // PA (A = +, P = -)
    is: Math.round(centerMM[2]), // IS (S = +, I = -)
    width: Math.round(dimensionsMM[0]), // Width (LR)
    height: Math.round(dimensionsMM[1]), // Height (PA)
    depth: Math.round(dimensionsMM[2]), // Depth (IS)
    form: maskForm,
    function: maskFunction,
    noise: maskNoise,
    fill: maskFill,
  };

  await setParameters(iec, output);
}

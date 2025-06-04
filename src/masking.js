import * as math from 'mathjs';

/*
 * Functions related to masking
 */

// TODO experiment for singleton value
export let loaded = { loaded: false };



export async function getDetails(iec) {

  const response = await fetch(`/papi/v1/masking/${iec}`);
  const details = await response.json();

  return details;
}
export async function flagForMasking(iec) {
  const response = await fetch(
    `/papi/v1/masking/${iec}/mask`,
    {
      method: "POST",
    }
  );
  const details = await response.json();

  return details;
}
export async function flagAsAccepted(iec) {
  const response = await fetch(
    `/papi/v1/masking/${iec}/accept`,
    {
      method: "POST",
    }
  );
  const details = await response.json();

  return details;
}
export async function flagAsRejected(iec) {
  const response = await fetch(
    `/papi/v1/masking/${iec}/reject`,
    {
      method: "POST",
    }
  );
  const details = await response.json();

  return details;
}
export async function flagAsSkipped(iec) {
  const response = await fetch(
    `/papi/v1/masking/${iec}/skip`,
    {
      method: "POST",
    }
  );
  const details = await response.json();

  return details;
}
export async function flagAsNonmaskable(iec) {
  const response = await fetch(
    `/papi/v1/masking/${iec}/nonmaskable`,
    {
      method: "POST",
    }
  );
  const details = await response.json();

  return details;
}

export async function setParameters(
  iec,
  { lr, pa, is, width, height, depth, form, function: maskFunction }
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
    function: maskFunction
  });
  // console.log("setParameters", body);

  const response = await fetch(
    `/papi/v1/masking/${iec}/parameters`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    }
  );
  const details = await response.json();

  return details;
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

//TODO this should probably be moved somewhere else, masking.js maybe?
export async function finalCalc(coords, volumeId, iec, maskForm, maskFunction) {

  // Experimental adjustment of coordinates for masker
  function invert(val, maxval) {
    return maxval - val;
  }

  function convertLPStoRAS(point, dims) {
    const [dimX, dimY, dimZ] = dims;
    let [x, y, z] = point;
    x = invert(x, dimX);
    y = invert(y, dimY);
    return [x, y, z];
  }

  function scaleBySpacing(point, spacings) {
    const [spaceX, spaceY, spaceZ] = spacings;
    let [x, y, z] = point;
    return [
      Math.floor(x * spaceX),
      Math.floor(y * spaceY),
      Math.floor(z * spaceZ)
    ];
  }

  function convertCoordinates(
    coords,                    // The input coordinates (min/max for x, y, z)
    volume,                    // The image volume
    targetDirection,           // The direction matrix of the target space
  ) {

    // Add 1 to max values to ensure that the max values are inclusive
    coords = Object.keys(coords).reduce((acc, axis) => {
      acc[axis] = {
        min: coords[axis].min,
        max: coords[axis].max + 1
      };
      return acc;
    }, {});

    const sourceDimensions = volume.dimensions
    const sourceOrigin = volume.origin
    const sourceSpacing = volume.spacing
    const sourceDirection = [
      [volume.direction[0], volume.direction[1], volume.direction[2]],
      [volume.direction[3], volume.direction[4], volume.direction[5]],
      [volume.direction[6], volume.direction[7], volume.direction[8]]
    ];
    const sourceDimensionsPhysical = math.dotMultiply(sourceDimensions, sourceSpacing)

    // Calculate the transformation matrix from source to target direction
    const transformationMatrix = math.multiply(
      math.inv(targetDirection),  // Inverse of the target direction matrix
      math.inv(sourceDirection)   // Multiplied by inverse of source direction matrix
    );

    // Transform origin / spacing / dimensions based on the transformation matrix
    const targetOrigin = math.multiply(transformationMatrix, sourceOrigin)
    const targetSpacing = math
      .abs(math.dotMultiply(transformationMatrix, sourceSpacing))
      .map(row => math.sum(row))
    const targetDimensions = math.round(
      math.dotDivide(
        math.abs(
          math.multiply(
            transformationMatrix,
            math.dotMultiply(sourceDimensions, sourceSpacing),
          ),
        ),
        targetSpacing,
      ),
    );
    const targetDimensionsPhysical = math.dotMultiply(
      targetDimensions,
      targetSpacing,
    );

    // Define the 8 corners of the cuboid in the source voxel space
    const sourceVoxelCorners = [
      [coords.x.min, coords.y.min, coords.z.min],  // Bottom-front-left corner
      [coords.x.min, coords.y.min, coords.z.max],  // Bottom-front-right corner
      [coords.x.min, coords.y.max, coords.z.min],  // Top-front-left corner
      [coords.x.min, coords.y.max, coords.z.max],  // Top-front-right corner
      [coords.x.max, coords.y.min, coords.z.min],  // Bottom-back-left corner
      [coords.x.max, coords.y.min, coords.z.max],  // Bottom-back-right corner
      [coords.x.max, coords.y.max, coords.z.min],  // Top-back-left corner
      [coords.x.max, coords.y.max, coords.z.max]   // Top-back-right corner
    ];

    // Scale voxel coordinates to physical space (updated to include origin for non-standard translations)
    const sourcePhysicalCorners = sourceVoxelCorners.map(corner =>
      math.add(
        sourceOrigin,                             // Add the origin of the source space
        math.dotMultiply(corner, sourceSpacing)   // Scale the corner coordinates by the source spacing
      )
    );

    // Apply the transformation matrix to convert physical coordinates from source to target space
    let targetPhysicalCorners = sourcePhysicalCorners.map(corner =>
      math.add(
        math.multiply(
          transformationMatrix,                 // Apply the transformation matrix
          math.subtract(corner, sourceOrigin)   // Subtract the source origin from the physical coordinates
        ),
        targetOrigin                              // Add the target origin to the transformed coordinates
      )
    );

    // Reapply the target origin to the transformed corners(comment out if not applying above)
    targetPhysicalCorners = math.subtract(targetPhysicalCorners, targetOrigin)

    // Initialize an array to store whether each target axis (X, Y, Z) should be flipped
    const flippedAxes = [false, false, false];

    // Iterate over each target axis (i = 0 ? X, 1 ? Y, 2 ? Z)
    for (let targetAxis = 0; targetAxis < 3; targetAxis++) {
      let bestDot = -Infinity; // Best alignment strength so far
      let bestFlip = false; // Whether that best match was flipped

      // Compare against all source axes to find the best match
      for (let sourceAxis = 0; sourceAxis < 3; sourceAxis++) {
        // Compute how aligned source and target axes are via dot product
        const dot = math.dot(
          targetDirection[targetAxis],
          sourceDirection[sourceAxis],
        );
        const absDot = Math.abs(dot); // Ignore sign for best alignment check

        // If this is the strongest alignment we've seen...
        if (absDot > bestDot) {
          bestDot = absDot; // Update best match strength
          bestFlip = dot < 0; // Mark if it's flipped (i.e., dot < 0)
        }
      }
      // Save the flip status for this target axis
      flippedAxes[targetAxis] = bestFlip;
    }

    // Reflect axes that are flipped
    for (let i = 0; i < 3; i++) {
      // Iterate over x, y, z dimensions
      if (flippedAxes[i]) {
        // If the axis is flipped
        targetPhysicalCorners = targetPhysicalCorners.map((corner) => {
          // Reflect the negative value by adding the target dimension
          corner[i] = targetDimensionsPhysical[i] + corner[i];
          return corner; // Return the modified corner
        });
      }
    }


    // Applying rounding to get final physical coordinates
    targetPhysicalCorners =
      targetPhysicalCorners.map(corner =>
      corner.map(coord => math.round(coord)),
    );

    // Clip the voxel coordinates to ensure they stay within the target dimensions
    targetPhysicalCorners =
      targetPhysicalCorners.map(corner =>
      corner.map((value, index) =>
        math.max(0, math.min(value, targetDimensionsPhysical[index])),
      ),
    );





    // Convert physical corners to voxel space in the target plane
    // Not used, only for debugging
    let targetVoxelCorners = targetPhysicalCorners.map(corner =>
      corner.map((coord, index) => math.round(coord / targetSpacing[index]))
    );

    // Compute the final transformed coordinates (min/max for x, y, z)
    const transformedCoords = {
      x: {
        min: math.min(targetPhysicalCorners.map(corner => corner[0])),  // Minimum x-coordinate
        max: math.max(targetPhysicalCorners.map(corner => corner[0]))   // Maximum x-coordinate
      },
      y: {
        min: math.min(targetPhysicalCorners.map(corner => corner[1])),  // Minimum y-coordinate
        max: math.max(targetPhysicalCorners.map(corner => corner[1]))   // Maximum y-coordinate
      },
      z: {
        min: math.min(targetPhysicalCorners.map(corner => corner[2])),  // Minimum z-coordinate
        max: math.max(targetPhysicalCorners.map(corner => corner[2]))   // Maximum z-coordinate
      }
    };

    // Return the transformed coordinates
    return transformedCoords;
  }

  // console.log("finalCalc running");
  // console.log(coords);

  const volume = cornerstone.cache.getVolume(volumeId);

  //// sagittal plane
  //// 1.3.6.1.4.1.14519.5.2.1.1600.1206.239190725826528812824420431561: 6994
  //const volume_test = {
  //    dimensions: [512, 512, 200],
  //    direction: [0, 1, 0, 0, 0, -1, -1, 0, 0],
  //    origin: [247.1846313, -816.7918091, 1671.210083],
  //    spacing: [3.192499876, 3.192499876, 2.5]
  //}
  //const coords_test = { x: { min: 231, max: 260 }, y: { min: 0, max: 221 }, z: { min: 0, max: 199 } };

  const targetDirection = [
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, 1]
  ];  // RAS Axial

  const isFlat = coords.z.min === coords.z.max;

  const transformedCoords = isFlat
    ? coords  // skip transformation
    : convertCoordinates(coords, volume, targetDirection);

  // console.log("Transformed coordinates in the target plane:");
  // console.log(transformedCoords);

  let cornerPoints = {
    l: transformedCoords.x.min,
    r: transformedCoords.x.max,
    p: transformedCoords.y.min,
    a: transformedCoords.y.max,
    i: transformedCoords.z.min,
    s: transformedCoords.z.max
  }

  let centerPoint = [
    math.round((transformedCoords.x.max + transformedCoords.x.min) / 2),
    math.round((transformedCoords.y.max + transformedCoords.y.min) / 2),
    math.round((transformedCoords.z.max + transformedCoords.z.min) / 2)
  ];

  // Dimensions calculation
  const width = math.round(math.abs(transformedCoords.x.max - transformedCoords.x.min));
  const height = math.round(math.abs(transformedCoords.y.max - transformedCoords.y.min));
  const depth = math.round(math.abs(transformedCoords.z.max - transformedCoords.z.min));

  const output = {
    lr: centerPoint[0], // Left-right position
    pa: centerPoint[1], // Posterior-anterior position
    is: centerPoint[2], // Inferior-Superior position
    width: width,
    height: height,
    depth: depth,
    form: maskForm,
    function: maskFunction,
  };

  // console.log(output);
  await setParameters(iec, output);
}

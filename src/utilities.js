import * as cornerstone from '@cornerstonejs/core';
import dicomParser from 'dicom-parser';
import * as cornerstoneTools from '@cornerstonejs/tools';
import createImageIdsAndCacheMetaData from './lib/createImageIdsAndCacheMetaData';

const { 
  volumeLoader,
  imageLoader,
  metaData,
} = cornerstone;
const { 
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;


export function expandSegTo3D(segmentationId) {
	const segmentationVolume = cornerstone.cache.getVolume(segmentationId);
	const { dimensions, voxelManager } = segmentationVolume;

	// It's fastest to extract the scalardata as an array
	// and then set it back later, rather than to update individual pixels
	let scalarData = voxelManager.getCompleteScalarDataArray();

	const [x_size, y_size, z_size] = dimensions;

	let xmin = z_size * y_size * x_size;
	let xmax = 0;
	let ymin = xmin;
	let ymax = 0;
	let zmin = xmin;
	let zmax = 0;

	for (let z = 0; z < z_size; z++) {
		for (let y = 0; y < y_size; y++) {
			for (let x = 0; x < x_size; x++) {
				// offset into the array
				let offset = (z * x_size * y_size) + (y * x_size) + x;

				if (scalarData[offset] > 0) {
					if (x < xmin) { xmin = x; }
					if (x > xmax) { xmax = x; }
					if (y < ymin) { ymin = y; }
					if (y > ymax) { ymax = y; }
					if (z < zmin) { zmin = z; }
					if (z > zmax) { zmax = z; }
				}
			}
		}
	}
	// Expand into a cube
	for (let z = 0; z < z_size; z++) {
		for (let y = 0; y < y_size; y++) {
			for (let x = 0; x < x_size; x++) {
				// offset into the array
				let offset = (z * x_size * y_size) + (y * x_size) + x;
				if (
					x >= xmin &&
					x <= xmax &&
					y >= ymin &&
					y <= ymax &&
					z >= zmin &&
					z <= zmax
				) {
					scalarData[offset] = 2;
				} else {
					scalarData[offset] = 0;
				}
			}
		}
	}

	voxelManager.setCompleteScalarDataArray(scalarData);

	return {
		x: { min: xmin, max: xmax },
		y: { min: ymin, max: ymax },
		z: { min: zmin, max: zmax },
	};
}

export function getCoordsForStackSeg(segmentationId) {
  const segmentation = cornerstoneTools.segmentation.state.getSegmentation(segmentationId);
  const imageIds = segmentation.representationData.Labelmap.imageIds;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  imageIds.forEach((imageId, z) => {
    const image = cornerstone.cache.getImage(imageId);
    const pixelData = image.getPixelData();
    const { rows, columns } = image;

    let sliceHasData = false;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        if (pixelData[index] > 0) {
          sliceHasData = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (sliceHasData) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  });

  if (minX === Infinity) {
    return null; // No segmentation found
  }

  return {
    x: { min: minX, max: maxX },
    y: { min: minY, max: maxY },
    z: { min: minZ, max: maxZ },
  };
}



/**
 * A generic distance calucaltion between two (3D) points
 */
export function calculateDistance(point1, point2) {
	const dx = point2[0] - point1[0];
	const dy = point2[1] - point1[1];
	const dz = point2[2] - point1[2];

	const distance = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);

	return distance;
}

/*
 * Return true if the given segmentation is
 * empty or flat (exists in only one plane / 2 dimensions)
 */
export function isSegFlat(segmentationId) {
  const segmentationVolume = cornerstone.cache.getVolume(segmentationId);
	const { dimensions, voxelManager } = segmentationVolume;
	const scalarData = voxelManager.getCompleteScalarDataArray();

  const [x_size, y_size, z_size] = dimensions;

  const xSet = new Set();
  const ySet = new Set();
  const zSet = new Set();

  for (let z = 0; z < z_size; z++) {
    for (let y = 0; y < y_size; y++) {
      for (let x = 0; x < x_size; x++) {
        // offset into the array
        let offset = z * x_size * y_size + y * x_size + x;

        if (scalarData[offset] === 1) {
          xSet.add(x);
          ySet.add(y);
          zSet.add(z);
        }
      }
    }
  }

  const isFlat = xSet.size === 1 || ySet.size === 1 || zSet.size === 1;

  if (xSet.size === 0 && ySet.size === 0 && zSet.size === 0) {
    // empty segmentation, same as flat for our purposes
    return true;
  }

  return isFlat;
}

export async function getUsername() {
	const response = await fetch(`/papi/v1/other/testme`);
	const details = await response.json();

	return details.username;
}

export async function getFiles(iec) {

	const response = await fetch(`/papi/v1/iecs/${iec}/files`);
	const details = await response.json();

	return details.file_ids;
}

/**
 * Get the file list for an IEC, or the reviewfiles list
 */
export async function getIECInfo(iec, mask_review=false) {

	let response

	if (mask_review) {
		response = await fetch(`/papi/v1/masking/${iec}/reviewfiles`);
	} else {
		response = await fetch(`/papi/v1/iecs/${iec}/frames`);
	}

	let volumetric;
	let frames = [];

	if (response && response.ok) {
		let fileInfo = await response.json();
		volumetric = fileInfo.volumetric;

		for (let file of fileInfo.frames) {
			//console.log(file);
			for (let i = 0; i < file.num_of_frames; i++) {
				if (frames.num_of_frames > 1) {
					frames.push(`wadouri:/papi/v1/files/${file.file_id}/data?frame=${i}`);
				} else {
					frames.push(`wadouri:/papi/v1/files/${file.file_id}/data`);
				}
			}
		}
	}
	return { volumetric, frames };
}

export async function getIECsForVR(visual_review_id) {

	const response = await fetch(
		`/papi/v1/masking/visualreview/${visual_review_id}`);
	const details = await response.json();

	return details;
}

export async function getFilesForNiftiVR(nifti_visual_review_id) {

	const response = await fetch(
		`/papi/v1/nifti/visualreview/${nifti_visual_review_id}`);
	const details = await response.json();

	return details;
}

export async function loadIECVolumeAndSegmentation(iec, volumeId, segmentationId) {
  let imageIds;
  try {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID:
      `iec:${iec}`,
      SeriesInstanceUID:
      "any",
      wadoRsRoot: "/papi/v1/wadors",
    })
  } catch (error) {
    console.log(error);
    return;
  }

  if (!imageIds || imageIds.length === 0) {
    console.log("No imageIds found for IEC:", iec);
    return;
  }

  return await loadVolumeAndSegmentation(imageIds, volumeId, segmentationId);

}

export async function loadVolumeAndSegmentation(imageIds, volumeId, segmentationId) {

  let volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) {
    console.log("Volume didn't already exist, creating it");
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    })
  } else {
    console.log("Volume already existed, not creating it");
    cornerstone.cache.removeVolumeLoadObject(segmentationId);
  }

  // Set the volume to load
  await volume.load();

  cornerstoneTools.segmentation.removeAllSegmentations();
  cornerstoneTools.segmentation.removeAllSegmentationRepresentations();

  // Create a segmentation of the same resolution as the source data for the CT volume
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  return volume;
}

export async function loadStackSegmentation(imageIds, segmentationId) {

  cornerstoneTools.segmentation.removeAllSegmentations();
  cornerstoneTools.segmentation.removeAllSegmentationRepresentations();

  // Create a segmentation of the same resolution as the source data for the CT volume
  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);
}


export async function getImageIdsFromIEC(iec) {
	let imageIds;
	try {
		imageIds = await createImageIdsAndCacheMetaData({
			StudyInstanceUID:
				`iec:${iec}`,
			SeriesInstanceUID:
				"any",
			wadoRsRoot: "/papi/v1/wadors",
		})
	} catch (error) {
		console.log(error);
		return;
	}

	return imageIds;
}

export function toAbsoluteURL(relative_url) {
  // There are a few functions in Cornerstone that expect an absolute URL
  // even when they really sould be able to accept a relative one.
  // This is a hacky way to generate an absolute URL from a relative

  let url = new URL(window.location);

  return url.origin + relative_url;
}

export async function getDicomDump(file_id) {

	const response = await fetch(
		`/papi/v1/dump/${file_id}`);

	const dump = await response.text();

	return dump;
}

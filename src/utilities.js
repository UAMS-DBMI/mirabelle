// import DEBUG, { log } from '@/debug';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as cornerstoneAdapters from "@cornerstonejs/adapters";
import createImageIdsAndCacheMetaData from './lib/createImageIdsAndCacheMetaData';
import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { useSearchParams } from "react-router-dom";

const { volumeLoader, imageLoader, metaData } = cornerstone;
const { Enums: csToolsEnums, segmentation: csToolsSegmentation, } = cornerstoneTools;
const { Cornerstone3D } = cornerstoneAdapters.adaptersSEG;

import dcmjs from 'dcmjs';

export function expandSegTo3D(segmentationId) {
	const segmentationVolume = cornerstone.cache.getVolume(segmentationId);
	const { dimensions, voxelManager } = segmentationVolume;

	// It's fastest to extract the scalardata as an array
	// and then set it back later, rather than to update individual pixels
  // I tested it twice, this is more than 10x faster
	let scalarData = voxelManager.getCompleteScalarDataArray();

	const [i_size, j_size, k_size] = dimensions;

  const [
    [imin, imax],
    [jmin, jmax],
    [kmin, kmax],
  ] = voxelManager.getBoundsIJK();

  for (let k = kmin; k <= kmax; k++) {
    for (let j = jmin; j <= jmax; j++) {
      for (let i = imin; i <= imax; i++) {
        // offset into the array
        let offset = (k * i_size * j_size) + (j * i_size) + i;
        scalarData[offset] = 2;
      }
    }
  }
	voxelManager.setCompleteScalarDataArray(scalarData);
  voxelManager.setBounds([[imin, imax], [jmin, jmax], [kmin, kmax]]);

	return {
		i: { min: imin, max: imax },
		j: { min: jmin, max: jmax },
		k: { min: kmin, max: kmax },
	};
}

export function getCoordsForStackSeg(imageIds) {

  let imin = Infinity, jmin = Infinity, kmin = Infinity;
  let imax = -Infinity, jmax = -Infinity, kmax = -Infinity;

  imageIds.forEach((imageId, k) => {
    const image = cornerstone.cache.getImage(imageId);
    const pixelData = image.getPixelData();
    const { rows, columns } = image;

    let sliceHasData = false;

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const index = j * columns + i;
        if (pixelData[index] > 0) {
          sliceHasData = true;
          if (i < imin) imin = i;
          if (i > imax) imax = i;
          if (j < jmin) jmin = j;
          if (j > jmax) jmax = j;
        }
      }
    }

    if (sliceHasData) {
      if (k < kmin) kmin = k;
      if (k > kmax) kmax = k;
    }
  });

  if (imin === Infinity) {
    return null; // No segmentation found
  }

  return {
    i: { min: imin, max: imax },
    j: { min: jmin, max: jmax },
    k: { min: kmin, max: kmax },
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

  const bounds = voxelManager.getBoundsIJK();

  const { flat } = isFlat(bounds);
  return flat;
}

function isFlat(bounds, eps = 1e-6) {
  const [[imin, imax], [jmin, jmax], [kmin, kmax]] = bounds;

  // Normalize (handle reversed min/max)
  const iExtent = Math.abs(imax - imin);
  const jExtent = Math.abs(jmax - jmin);
  const kExtent = Math.abs(kmax - kmin);

  const extents = [iExtent, jExtent, kExtent];

  const zeroI = iExtent <= eps;
  const zeroJ = jExtent <= eps;
  const zeroK = kExtent <= eps;

  let plane = null;
  if (zeroI && !zeroJ && !zeroK) plane = 'i';
  else if (!zeroI && zeroJ && !zeroK) plane = 'j';
  else if (!zeroI && !zeroJ && zeroK) plane = 'k';
  else if (zeroI || zeroJ || zeroK) {
    // Degenerate cases (line or point): still "flat"
    plane = zeroI ? 'i' : zeroJ ? 'j' : 'k';
  }

  return { flat: zeroI || zeroJ || zeroK, plane, extents };
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
export async function getIECInfo(iec, mask_review=false, decimate_count=2000) {
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
        if (file.num_of_frames > 1) {
					frames.push(`wadouri:/papi/v1/files/${file.file_id}/data?frame=${i}`);
				} else {
					frames.push(`wadouri:/papi/v1/files/${file.file_id}/data`);
				}
			}
		}
	}

  frames = decimateFrames(frames, decimate_count);

	return { volumetric, frames };
}

function decimateFrames(imageIds, maxFrames = 2000) {
  // Decimate Z if too many frames
  let usedImageIds = imageIds;
  if (Array.isArray(imageIds) && imageIds.length > maxFrames) {
    const step = Math.ceil(imageIds.length / maxFrames);
    const decimated = [];
    for (let i = 0; i < imageIds.length; i += step) {
      decimated.push(imageIds[i]);
    }
    // Ensure last slice is included
    if (decimated[decimated.length - 1] !== imageIds[imageIds.length - 1]) {
      decimated.push(imageIds[imageIds.length - 1]);
    }
    usedImageIds = decimated;
    console.warn(
      `Decimating volume along Z: ${imageIds.length} -> ${usedImageIds.length} frames (step=${step})`
    );
  }

  return usedImageIds;
}

export async function getIECsForDicomVR(visual_review_id) {

	const response = await fetch(
		`/papi/v1/visualreviews/${visual_review_id}/iecs`);
	const details = await response.json();

	return details;
}

export async function getFilteredIECsForDicomVR(
  visual_review_id,
  review_status = "*",
  dicom_file_type = "*",
  processing_status = "*"
) {
  // Accept 'All' from URL/UI and translate to '*' for the API.
  // Also treat the literal string 'undefined' (from stale URLs) as 'All'.
  const mapAllToStar = (v) => (v == null || v === '' || v === 'All' || v === 'undefined' ? '*' : v);
  // Special-case review status: 'Unreviewed' must be null in the API payload
  const mapReviewStatus = (v) => {
    if (v === 'Unreviewed') return null;
    return mapAllToStar(v);
  };
  const _review_status = mapReviewStatus(review_status);
  const _dicom_file_type = mapAllToStar(dicom_file_type);
  const _processing_status = mapAllToStar(processing_status);

  const payload = {
    dicom_file_type: _dicom_file_type,
    processing_status: _processing_status,
    review_status: _review_status,
  };

  const response = await fetch(
    `/papi/v1/visualreviews/${visual_review_id}/filter`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`getFilteredIECsForDicomVR failed: ${response.status} ${text}`);
  }

  const details = await response.json();
  return details;
}

export async function getValuesForDicomVR(visual_review_id) {

	const response = await fetch(
		`/papi/v1/visualreviews/${visual_review_id}/values`);
	const details = await response.json();

	return details;
}

export async function getIECsForMaskVR(visual_review_id) {

	const response = await fetch(
		`/papi/v1/masking/visualreview/${visual_review_id}`);
	const details = await response.json();

	return details;
}

export async function getFilteredIECsForMaskVR(visual_review_id, masking_status = 'All', dicom_file_type = 'All') {
	const params = new URLSearchParams();
	if (masking_status && masking_status !== 'All') {
		params.set('masking_status', masking_status.toLowerCase());
	}
	if (dicom_file_type && dicom_file_type !== 'All') {
		params.set('dicom_file_type', dicom_file_type);
	}
	const query = params.toString() ? `?${params.toString()}` : '';
	const response = await fetch(`/papi/v1/masking/visualreview/${visual_review_id}${query}`);
	const details = await response.json();
	return details;
}

export async function getIECsForMaskReviewVR(visual_review_id) {

	const response = await fetch(
		`/papi/v1/masking/visualreview/${visual_review_id}?awaiting_review=true`);
	const details = await response.json();

	return details;
}

export async function getFilteredIECsForMaskReviewVR(visual_review_id, masking_status = 'All', dicom_file_type = 'All') {
	const params = new URLSearchParams();
	params.set('awaiting_review', 'true');
	if (masking_status && masking_status !== 'All') {
		params.set('masking_status', masking_status.toLowerCase());
	}
	if (dicom_file_type && dicom_file_type !== 'All') {
		params.set('dicom_file_type', dicom_file_type);
	}
	const response = await fetch(`/papi/v1/masking/visualreview/${visual_review_id}?${params.toString()}`);
	const details = await response.json();
	return details;
}

export async function getOtherIECsForFOR(iec) {

  const response = await fetch(
    `/papi/v1/iecs/${iec}/other_iecs_in_for`);
  const iecList = await response.json();

  return iecList;
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
  let loadedFromCache = true;
  let volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) {
    console.log("Volume didn't already exist, creating it");
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    loadedFromCache = false;
  } else {
    // triggerEvent(eventTarget, 'VolumeReallyLoaded', {
    //   volumeId,
    //   segmentationId,
    // });
    console.log("Volume already existed, not creating it");
  }

  // Set the volume to load
  volume.load(() => {
    csToolsSegmentation.removeAllSegmentations();
    csToolsSegmentation.removeAllSegmentationRepresentations();

    // Create a segmentation of the same resolution as the source data for the CT volume
    volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
      volumeId: segmentationId,
    });

    csToolsSegmentation.addSegmentations([
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
    // if (loadedFromCache) {
    //   await new Promise((r) => setTimeout(r, 300));
    // }
    triggerEvent(eventTarget, 'VolumeReallyLoaded', {
      volumeId,
      segmentationId,
    });

    console.log("Volume loaded:", volumeId);
  });
  return volume;
}


/**
 * This is a version of loadVolume that returns a Promise that resolves
 * only when the volume is fully loaded. 
 * 
 * This would allow you to `await loadVolumeAsync(...)` and pause until
 * the volume is loaded.
 */
export function loadVolumeAsync(imageIds, volumeId, segmentationId, callback=null) {
  return new Promise((resolve) => {
    loadVolume(imageIds, volumeId, segmentationId, (result) => {
      resolve(result);
    });
  });
}

/**
 * Load a volume via WADO-URI
 * 
 * @param {Array<string>} imageIds 
 * @param {string} volumeId 
 * @param {string} segmentationId 
 * @param {function} callback 
 * @returns 
 */
export async function loadVolume(imageIds, volumeId, segmentationId, callback = null) {
  let volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) {
    console.log("Volume didn't already exist, creating it:", volumeId);
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds
    });
  } else {
    
    console.log("Volume already existed, not creating it");
  }

  volume.load(callback);

  return volume;
}

export async function loadVolumeSegmentation(imageIds, volumeId, segmentationId) {

  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  // Create a segmentation of the same resolution as the source data for the CT volume
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  csToolsSegmentation.addSegmentations([
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
}

export async function loadStackSegmentation(imageIds, segmentationId) {

  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  const results = await Promise.allSettled(cornerstone.imageLoader.loadAndCacheImages(imageIds));

  // Create a segmentation of the same resolution as the source data for the CT volume
  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  csToolsSegmentation.addSegmentations([
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

function parseSegMetadata(arrayBuffer) {
  const dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
  const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
  const segments = dataset.SegmentSequence;
  const frames = dataset.PerFrameFunctionalGroupsSequence;
  return { dataset, segments, frames };
}

function cielabToRGBA(color) {
  if (!color) {
    return [0, 0, 0, 255]; // Default to black if no color is provided
  }
  const [L, a, b] = color;
  return dcmjs.data.Colors.dicomlab2RGB([L, a, b])
    .map(val => Math.round(val * 255));
}

export async function loadSEGSegmentation(arrayBuffer, referenceImageIds, segmentationId) {

  csToolsSegmentation.removeAllSegmentations();
  csToolsSegmentation.removeAllSegmentationRepresentations();

  // Parse the DICOM SEG metadata using adapterSEG
  const adapterRet = 
    await Cornerstone3D.Segmentation.createFromDICOMSegBuffer(
      referenceImageIds,
      arrayBuffer,
      { metadataProvider: metaData }
    );

  const { labelMapImages } = adapterRet;

  // build segmentList from segMetadata
  const segmentList = adapterRet.segMetadata.data.map((seg, i) => {
    if (!seg) { 
      // NOTE: This might not always be the case, but in testing
      // so far, DICOM SEG objects seem to have an empty segment
      // at the beginning. This code could fail if the empty segment
      // is somewhere else, not sure.
      //
      // skip is set so in the SegPanel we can skip rendering
      return {
        segmentIndex: i,
        label: `Empty Segment ${i}`,
        description: "Empty Segment",
        visible: false,
        skip: true, // will use this in SegPanel to skip rendering
      }
    }
    let segment = {
      segmentIndex: seg.SegmentNumber ?? i + 1,
      label: seg.SegmentLabel ?? `Segment ${i + 1}`,
      description: seg.SegmentDescription ?? "", // optional, unused?
      color: cielabToRGBA(seg.RecommendedDisplayCIELabValue),
      visible: true,
    };
    return segment;
  });

  // Create a new segmentation object for each entry
  // in the labelMapImages 
  const segmentationList = labelMapImages.map((labelMapImage, i) => {
    // Create a segmentation for each labelMapImage
    const newSegmentationId = `${segmentationId}-${i}`;
    csToolsSegmentation.addSegmentations([
      {
        segmentationId: newSegmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: { imageIds: labelMapImage.map((image) => image.imageId) },
        },
        config: {
          segments: segmentList,
        },
      },
    ]);
    return newSegmentationId;
  });

  return {
    segments: segmentList,
    segmentationIds: segmentationList,
  }
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

export function get3dViewports(renderingEngine) {
  // return all the viewports that have a 3D volume type

  // Get all viewports from the rendering engine
  const viewports = renderingEngine.getViewports();

  // Find 3D viewports
  return viewports.find(viewport => {
        return viewport.type === cornerstone.Enums.ViewportType.VOLUME_3D;
      });
}

export function fetchFileAsArrayBuffer(fileId) {
  // Fetch a file from the server and return it as an ArrayBuffer
  return fetch(`/papi/v1/files/${fileId}/data`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      return response.arrayBuffer();
    });
}

/**
 * Converts IJK (index) coordinates to World (physical) coordinates
 * @param {Array} ijkCoords - Array of [i, j, k] coordinates
 * @param {Object} volume - Volume object containing dimensions, origin, spacing, and direction
 * @returns {Array} World coordinates [x, y, z] in physical space
 */
export function ijkToWorld(ijkCoords, volume) {
  const [i, j, k] = ijkCoords;
  const { origin, spacing, direction } = volume;
  
  // Convert the flat 9-element direction array to a 3x3 matrix
  const directionMatrix = [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]]
  ];
  
  // Scale by spacing first
  const scaledCoords = [
    i * spacing[0],
    j * spacing[1], 
    k * spacing[2]
  ];
  
  // Apply direction matrix transformation
  const worldCoords = [
    directionMatrix[0][0] * scaledCoords[0] + directionMatrix[0][1] * scaledCoords[1] + directionMatrix[0][2] * scaledCoords[2] + origin[0],
    directionMatrix[1][0] * scaledCoords[0] + directionMatrix[1][1] * scaledCoords[1] + directionMatrix[1][2] * scaledCoords[2] + origin[1],
    directionMatrix[2][0] * scaledCoords[0] + directionMatrix[2][1] * scaledCoords[1] + directionMatrix[2][2] * scaledCoords[2] + origin[2]
  ];
  
  return worldCoords;
}

/**
 * Converts World (physical) coordinates to IJK (index) coordinates
 * @param {Array} worldCoords - Array of [x, y, z] world coordinates
 * @param {Object} volume - Volume object containing dimensions, origin, spacing, and direction
 * @returns {Array} IJK coordinates [i, j, k] in index space
 */
export function worldToIjk(worldCoords, volume) {
  const [x, y, z] = worldCoords;
  const { origin, spacing, direction } = volume;
  
  // Convert the flat 9-element direction array to a 3x3 matrix
  const directionMatrix = [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]]
  ];
  
  // Subtract origin first
  const translatedCoords = [
    x - origin[0],
    y - origin[1],
    z - origin[2]
  ];
  
  // Apply inverse direction matrix transformation
  // For orthogonal matrices, inverse = transpose
  const physicalCoords = [
    directionMatrix[0][0] * translatedCoords[0] + directionMatrix[1][0] * translatedCoords[1] + directionMatrix[2][0] * translatedCoords[2],
    directionMatrix[0][1] * translatedCoords[0] + directionMatrix[1][1] * translatedCoords[1] + directionMatrix[2][1] * translatedCoords[2],
    directionMatrix[0][2] * translatedCoords[0] + directionMatrix[1][2] * translatedCoords[1] + directionMatrix[2][2] * translatedCoords[2]
  ];
  
  // Scale by inverse spacing
  const ijkCoords = [
    physicalCoords[0] / spacing[0],
    physicalCoords[1] / spacing[1],
    physicalCoords[2] / spacing[2]
  ];
  
  return ijkCoords;
}
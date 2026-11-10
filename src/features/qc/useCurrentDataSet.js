import { useSelector } from "react-redux";

import { wadouri } from "@cornerstonejs/dicom-image-loader";

import { noPixelDataSet } from "./noPixelData";

/**
 * The dicom-parser dataSet behind the currently displayed frame, straight
 * from the wadouri loader's cache (no extra server round-trip). Returns
 * nulls until the stack has rendered its first image.
 */
export default function useCurrentDataSet() {
  const currentImageId = useSelector((state) => state.options.currentImageId);

  if (!currentImageId) {
    return { url: null, frame: null, dataSet: null };
  }

  const parsed = wadouri.parseImageId(currentImageId);
  // A file with no pixel data (an SR) never becomes an image; its parsed
  // file is kept for the dump in case the loader's cache let it go.
  const dataSet =
    wadouri.dataSetCacheManager.get(parsed.url) ||
    noPixelDataSet(parsed.url) ||
    null;

  return { url: parsed.url, frame: parsed.frame ?? null, dataSet };
}

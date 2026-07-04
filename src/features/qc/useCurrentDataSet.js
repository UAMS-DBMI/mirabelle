import { useSelector } from "react-redux";

import { wadouri } from "@cornerstonejs/dicom-image-loader";

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
  const dataSet = wadouri.dataSetCacheManager.get(parsed.url) || null;

  return { url: parsed.url, frame: parsed.frame ?? null, dataSet };
}

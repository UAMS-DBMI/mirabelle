import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { target } = vi.hoisted(() => ({ target: new EventTarget() }));

vi.mock("@cornerstonejs/core", () => ({
  eventTarget: target,
  Enums: { Events: { IMAGE_LOAD_ERROR: "IMAGE_LOAD_ERROR" } },
}));

vi.mock("@cornerstonejs/dicom-image-loader", () => ({
  wadouri: {
    parseImageId: (imageId) => ({ url: imageId.replace(/^wadouri:/, "") }),
  },
}));

vi.mock("@/lib/notify", () => ({ notify: { markHandled: vi.fn() } }));

import { notify } from "@/lib/notify";
import {
  hasNoPixelData,
  noPixelDataSet,
  watchNoPixelData,
} from "./noPixelData";

const SR = "wadouri:/files/sr.dcm";
const IMAGE = "wadouri:/files/ct.dcm";

function loadError(imageId, error) {
  target.dispatchEvent(
    new CustomEvent("IMAGE_LOAD_ERROR", { detail: { imageId, error } }),
  );
}

function missing() {
  return {
    error: new Error("The pixel data is missing"),
    dataSet: { elements: {} },
  };
}

describe("watchNoPixelData", () => {
  let currentImageId;
  let onCurrentFrame;
  let stop;

  beforeEach(() => {
    currentImageId = SR;
    onCurrentFrame = vi.fn();
    stop = watchNoPixelData(
      () => ({ getCurrentImageId: () => currentImageId }),
      onCurrentFrame,
    );
    notify.markHandled.mockClear();
  });

  afterEach(() => stop());

  it("records a frame with no pixel data and keeps its parsed file", () => {
    const error = missing();
    loadError(SR, error);

    expect(hasNoPixelData(SR)).toBe(true);
    expect(noPixelDataSet("/files/sr.dcm")).toBe(error.dataSet);
    expect(notify.markHandled).toHaveBeenCalledWith(error);
    expect(onCurrentFrame).toHaveBeenCalledWith(SR);
  });

  it("doesn't take over the screen for a frame scrolled past", () => {
    currentImageId = IMAGE;
    loadError(SR, missing());

    expect(hasNoPixelData(SR)).toBe(true);
    expect(onCurrentFrame).not.toHaveBeenCalled();
  });

  it("leaves other load errors alone", () => {
    loadError(IMAGE, { error: new Error("504 Gateway Timeout") });

    expect(hasNoPixelData(IMAGE)).toBe(false);
    expect(notify.markHandled).not.toHaveBeenCalled();
    expect(onCurrentFrame).not.toHaveBeenCalled();
  });

  it("forgets the frames when it stops watching", () => {
    loadError(SR, missing());
    stop();

    expect(hasNoPixelData(SR)).toBe(false);
    expect(noPixelDataSet("/files/sr.dcm")).toBeNull();
  });
});

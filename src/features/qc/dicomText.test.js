import { describe, it, expect } from "vitest";

import {
  buildStudyInfo,
  formatDicomTime,
  formatDicomDate,
  hasValue,
} from "./dicomText";

// Minimal stand-in for a dicom-parser dataSet: string values by tag.
function dataSet(values) {
  return { string: (tag) => values[tag] };
}

describe("formatDicomTime", () => {
  it("shows hours and minutes", () => {
    expect(formatDicomTime("143205.123")).toBe("14:32");
    expect(formatDicomTime("0905")).toBe("09:05");
  });

  it("falls back to the placeholder", () => {
    expect(formatDicomTime(undefined)).toBe("—");
    expect(formatDicomTime("9")).toBe("—");
  });
});

describe("hasValue", () => {
  it("is false for empty values and the placeholder", () => {
    expect(hasValue("CT")).toBe(true);
    expect(hasValue("")).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue(formatDicomDate(undefined))).toBe(false);
  });
});

describe("buildStudyInfo", () => {
  it("reads the overlay fields", () => {
    const info = buildStudyInfo(
      dataSet({
        x00100030: "19650102",
        x00080080: "UAMS",
        x00080030: "081500",
        x00200011: "3",
      }),
    );
    expect(info.patientBirthDate).toBe("Jan 2, 1965");
    expect(info.institution).toBe("UAMS");
    expect(info.studyTime).toBe("08:15");
    expect(info.seriesNumber).toBe("3");
  });

  it("uses the placeholder for missing fields", () => {
    const info = buildStudyInfo(dataSet({}));
    expect(hasValue(info.patientBirthDate)).toBe(false);
    expect(hasValue(info.institution)).toBe(false);
    expect(hasValue(info.studyTime)).toBe(false);
    expect(hasValue(info.seriesNumber)).toBe(false);
  });
});

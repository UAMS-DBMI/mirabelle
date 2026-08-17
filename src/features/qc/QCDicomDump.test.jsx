import React from "react";
import { vi, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// Minimal stand-in for a dicom-parser dataSet: elements plus the value
// accessors the dump uses. Enough to exercise the row/group builders.
function makeDataSet(elements, values) {
  return {
    elements,
    string: (tag) => values[tag],
  };
}

const itemDataSet = makeDataSet(
  {
    x0020000e: { tag: "x0020000e", vr: "UI", length: 8 },
    x00081155: { tag: "x00081155", vr: "UI", length: 8 },
  },
  { x0020000e: "1.2.3.4", x00081155: "5.6.7.8" },
);

const dataSet = makeDataSet(
  {
    x00080060: { tag: "x00080060", vr: "CS", length: 2 },
    x00081115: {
      tag: "x00081115",
      vr: "SQ",
      length: 100,
      items: [{ dataSet: itemDataSet }, { dataSet: itemDataSet }],
    },
    x00100010: { tag: "x00100010", vr: "PN", length: 8 },
  },
  { x00080060: "CT", x00100010: "DOE^JANE" },
);

vi.mock("./useCurrentDataSet", () => ({
  default: () => ({ url: "wadouri:file", dataSet }),
}));

const { default: QCDicomDump } = await import("./QCDicomDump");

describe("QCDicomDump", () => {
  it("expands sequence items instead of only summarising them", () => {
    render(<QCDicomDump fileByUrl={{}} frameIndex={0} frameCount={1} />);

    expect(screen.getByText("<sequence, 2 item(s)>")).toBeTruthy();
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Item 2")).toBeTruthy();
    // Each item's elements are rendered, once per item.
    expect(screen.getAllByText("(0020,000E)")).toHaveLength(2);
    expect(screen.getAllByText("(0008,1155)")).toHaveLength(2);
    expect(screen.getAllByText("1.2.3.4")).toHaveLength(2);
  });

  it("keeps nested elements under their parent sequence's group", () => {
    render(<QCDicomDump fileByUrl={{}} frameIndex={0} frameCount={1} />);

    // (0020,000E) only appears inside the sequence, so it must not open a
    // "Group 0020" header of its own.
    expect(screen.queryByText("Group 0020")).toBeNull();
    expect(screen.getByText("Group 0008")).toBeTruthy();
    expect(screen.getByText("Group 0010")).toBeTruthy();
  });

  it("counts nested elements but not item delimiters in the tag count", () => {
    render(<QCDicomDump fileByUrl={{}} frameIndex={0} frameCount={1} />);

    // 3 top-level elements + 2 elements in each of the 2 items.
    expect(screen.getByText(/7 tags/)).toBeTruthy();
  });
});

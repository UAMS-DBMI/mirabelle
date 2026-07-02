import { vi, describe, it, expect, afterEach } from "vitest";

import {
  getQCAssignment,
  getQCAssignmentSeries,
  setQCSeriesStatus,
  buildSeriesImageIds,
  buildFileByUrlMap,
} from "./qc";

// The data layer's job is URL/param/body construction and envelope
// unwrapping, so the tests mock fetch and assert on the request shape.
function mockFetchJSON(payload) {
  const response = {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  };
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getQCAssignment", () => {
  it("requests the assignment and unwraps the data envelope", async () => {
    const data = { assignment: { assignment_id: 7 } };
    const fetchMock = mockFetchJSON({ data });

    await expect(getQCAssignment(7)).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      "/papi/v1/distribution/qc/assignments/7",
      undefined,
    );
  });
});

describe("getQCAssignmentSeries", () => {
  it("omits filters when unset", async () => {
    const fetchMock = mockFetchJSON({ data: [] });

    await getQCAssignmentSeries(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/papi/v1/distribution/qc/assignments/1/series",
      undefined,
    );
  });

  it('treats "All" as no filter', async () => {
    const fetchMock = mockFetchJSON({ data: [] });

    await getQCAssignmentSeries(1, { qcStatus: "All", modality: "All" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/papi/v1/distribution/qc/assignments/1/series",
      undefined,
    );
  });

  it("passes qc_status and modality as query params", async () => {
    const fetchMock = mockFetchJSON({ data: [] });

    await getQCAssignmentSeries(1, { qcStatus: "pending", modality: "CT" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/papi/v1/distribution/qc/assignments/1/series?qc_status=pending&modality=CT",
      undefined,
    );
  });
});

describe("setQCSeriesStatus", () => {
  it("PUTs the status with a null note when none is given", async () => {
    const fetchMock = mockFetchJSON({ data: { qc_status: "approved" } });

    await setQCSeriesStatus(1, "1.2.3", "approved");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/papi/v1/distribution/qc/assignments/1/series/1.2.3/status",
    );
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({
      qc_status: "approved",
      notes: null,
    });
  });

  it("includes the note when given", async () => {
    const fetchMock = mockFetchJSON({ data: {} });

    await setQCSeriesStatus(1, "1.2.3", "rejected", "blurry frames");
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      qc_status: "rejected",
      notes: "blurry frames",
    });
  });
});

describe("buildSeriesImageIds", () => {
  it("emits a plain wadouri id for single-frame files", () => {
    expect(
      buildSeriesImageIds([{ num_of_frames: 1, file_path: "/a/b" }]),
    ).toEqual(["wadouri:/files//a/b"]);
  });

  it("emits one id per frame for multi-frame files", () => {
    expect(
      buildSeriesImageIds([{ num_of_frames: 3, file_path: "/a/b" }]),
    ).toEqual([
      "wadouri:/files//a/b?frame=0",
      "wadouri:/files//a/b?frame=1",
      "wadouri:/files//a/b?frame=2",
    ]);
  });

  it("keeps file order and concatenates frames across files", () => {
    const files = [
      { num_of_frames: 2, file_path: "/x" },
      { num_of_frames: 1, file_path: "/y" },
    ];
    expect(buildSeriesImageIds(files)).toEqual([
      "wadouri:/files//x?frame=0",
      "wadouri:/files//x?frame=1",
      "wadouri:/files//y",
    ]);
  });
});

describe("buildFileByUrlMap", () => {
  it("keys each file by its wadouri url", () => {
    const files = [
      { file_id: 10, num_of_frames: 1, file_path: "/a" },
      { file_id: 11, num_of_frames: 2, file_path: "/b" },
    ];
    const map = buildFileByUrlMap(files);
    expect(map["/files//a"].file_id).toBe(10);
    expect(map["/files//b"].file_id).toBe(11);
  });
});

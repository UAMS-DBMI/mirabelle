/**
 * Data layer for the QC (Quality Control) route.
 *
 * All endpoints live under /papi/v1/distribution/qc/ and wrap their payload
 * in a `{ data, meta }` envelope; these helpers unwrap `data` so callers get
 * the useful object directly.
 */

import requestJSON from "@/lib/http";
import { messages } from "@/lib/messages";

const QC_BASE = "/papi/v1/distribution/qc";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * Get an assignment with its review and status/modality rollups.
 * Returns `{ assignment, review, series_by_status, series_by_modality }`.
 */
export async function getQCAssignment(assignmentId) {
  const response = await requestJSON(
    `${QC_BASE}/assignments/${assignmentId}`,
    undefined,
    { errorMessage: messages.qc.assignmentLoadFailed },
  );
  return response.data;
}

/**
 * Get the (optionally filtered) series list for an assignment.
 * `qcStatus` / `modality` accept "All" (or empty) to mean no filter.
 */
export async function getQCAssignmentSeries(
  assignmentId,
  { qcStatus, modality, page, limit } = {},
) {
  const params = new URLSearchParams();
  if (qcStatus && qcStatus !== "All") params.set("qc_status", qcStatus);
  if (modality && modality !== "All") params.set("modality", modality);
  if (page != null) params.set("page", page);
  if (limit != null) params.set("limit", limit);

  const query = params.toString();
  const url = `${QC_BASE}/assignments/${assignmentId}/series${query ? `?${query}` : ""}`;

  const response = await requestJSON(url, undefined, {
    errorMessage: messages.filters.loadFailed,
  });
  return response.data;
}

/**
 * Get the files for one series: `[{ file_id, num_of_frames, file_path }]`.
 */
export async function getQCSeriesFiles(assignmentId, seriesUid) {
  const response = await requestJSON(
    `${QC_BASE}/assignments/${assignmentId}/series/${seriesUid}/files`,
    undefined,
    { errorMessage: messages.errors.loadImage },
  );
  return response.data;
}

/**
 * Set the QC status of a series (`pending`, `approved`, `rejected`,
 * `flagged`), with an optional note. Returns the updated series record.
 */
export async function setQCSeriesStatus(
  assignmentId,
  seriesUid,
  qcStatus,
  notes,
) {
  const response = await requestJSON(
    `${QC_BASE}/assignments/${assignmentId}/series/${seriesUid}/status`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ qc_status: qcStatus, notes: notes || null }),
    },
    { errorMessage: messages.errors.saveStatus },
  );
  return response.data;
}

/**
 * Get the status-change history for a series.
 */
export async function getQCSeriesHistory(assignmentId, seriesUid) {
  const response = await requestJSON(
    `${QC_BASE}/assignments/${assignmentId}/series/${seriesUid}/history`,
    undefined,
    { errorMessage: messages.qc.historyLoadFailed },
  );
  return response.data;
}

/**
 * Build Cornerstone stack imageIds from a QC series-files response.
 * Multi-frame files expand to one imageId per frame. All frames are kept:
 * the stack viewport loads images lazily, and QC needs to see every frame.
 */
export function buildSeriesImageIds(files) {
  const imageIds = [];
  for (const file of files) {
    for (let i = 0; i < file.num_of_frames; i++) {
      if (file.num_of_frames > 1) {
        imageIds.push(`wadouri:/files/${file.file_path}?frame=${i}`);
      } else {
        imageIds.push(`wadouri:/files/${file.file_path}`);
      }
    }
  }
  return imageIds;
}

/**
 * Map each file's wadouri URL (the `url` part of its imageIds) back to the
 * file record, so UI like the DICOM dump can resolve the current imageId to
 * a `file_id`.
 */
export function buildFileByUrlMap(files) {
  const byUrl = {};
  for (const file of files) {
    byUrl[`/files/${file.file_path}`] = file;
  }
  return byUrl;
}

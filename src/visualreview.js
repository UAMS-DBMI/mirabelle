/*
 * Functions related to masking
 */

import { requestJSON } from "@/lib/http";
import { messages } from "@/lib/messages";

// TODO experiment for singleton value
export let loaded = { loaded: false };

export async function getNiftiDetails(file_id) {
  return requestJSON(`/papi/v1/nifti/${file_id}`, undefined, {
    errorMessage: messages.errors.loadImage,
  });
}

export async function setNiftiStatus(file_id, status) {
  return requestJSON(
    `/papi/v1/nifti/${file_id}/set_status/${status}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    { errorMessage: messages.errors.saveStatus },
  );
}

export async function getDicomDetails(iec) {
  return requestJSON(`/papi/v1/iecs/${iec}/info`, undefined, {
    errorMessage: messages.errors.loadImage,
  });
}

export async function setDicomStatus(iec, status) {
  return requestJSON(
    `/papi/v1/vrstatus/${iec}/set_status/${status}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    { errorMessage: messages.errors.saveStatus },
  );
}


export async function setMaskingFlag(iec) {
  return requestJSON(
    `/papi/v1/masking/${iec}/mask`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    { errorMessage: messages.errors.saveStatus },
  );
}

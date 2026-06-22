/*
 * Functions related to masking
 */

// TODO experiment for singleton value
export let loaded = { loaded: false };

export async function getNiftiDetails(file_id) {
  const response = await fetch(`/papi/v1/nifti/${file_id}`);
  const details = await response.json();

  return details;
}

export async function setNiftiStatus(file_id, status) {
  const response = await fetch(
    `/papi/v1/nifti/${file_id}/set_status/${status}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const details = await response.json();

  return details;
}

export async function getDicomDetails(iec) {
  const response = await fetch(`/papi/v1/iecs/${iec}/info`);
  const details = await response.json();

  return details;
}

export async function setDicomStatus(iec, status) {
  const response = await fetch(
    `/papi/v1/vrstatus/${iec}/set_status/${status}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const details = await response.json();

  return details;
}

export async function setMaskingFlag(iec) {
  const response = await fetch(`/papi/v1/masking/${iec}/mask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const details = await response.json();

  return details;
}

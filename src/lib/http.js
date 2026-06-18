/**
 * Thin fetch wrapper that normalizes HTTP and network failures.
 *
 * Every API call in Mirabelle should go through `requestJSON` so that:
 *   - non-2xx responses become a thrown `ApiError` (instead of silently
 *     parsing an error body as if it were a success),
 *   - network failures become an `ApiError` with a friendly message,
 *   - callers get a consistent `error.userMessage` to show the user.
 */

import { messages } from "./messages";

export class ApiError extends Error {
  /**
   * @param {string} userMessage  Friendly message safe to show the user.
   * @param {object} [opts]
   * @param {number} [opts.status] HTTP status code, if any.
   * @param {string} [opts.url]    Request URL, for logging.
   * @param {string} [opts.detail] Raw server detail, for logging.
   * @param {Error}  [opts.cause]  Underlying error, if any.
   */
  constructor(userMessage, { status, url, detail, cause } = {}) {
    super(userMessage);
    this.name = "ApiError";
    this.userMessage = userMessage;
    this.status = status;
    this.url = url;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}

/**
 * Fetch JSON from the API, throwing an `ApiError` on any failure.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {object} [config]
 * @param {string} [config.errorMessage] Friendly message for non-2xx responses.
 * @returns {Promise<any>} Parsed JSON body.
 */
export async function requestJSON(url, options, { errorMessage } = {}) {
  const friendly = errorMessage || messages.errors.generic;

  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    // fetch only rejects on network-level failures (offline, DNS, CORS).
    throw new ApiError(messages.errors.network, { url, cause });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(friendly, { status: response.status, url, detail });
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError(friendly, {
      status: response.status,
      url,
      detail: "Response was not valid JSON.",
      cause,
    });
  }
}

export default requestJSON;

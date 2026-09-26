/**
 * Keeps a NIfTI visual review's file order stable across page refreshes.
 *
 * Next/previous walk the list from /papi/v1/nifti/visualreview/:vr, which is
 * fetched once per page load. The server's list changes as files are graded,
 * so after a refresh the current file can land first, and Previous has
 * nowhere to go. Remembering the order for this browser tab (sessionStorage
 * survives a refresh, not a new tab) keeps the files already seen in place;
 * files the server lists that aren't remembered yet are appended in its order.
 */

const STORAGE_PREFIX = "mirabelle.niftiReviewOrder.";

/**
 * The remembered order for review `vr`, extended with any new files from the
 * server's `files`, and remembered again.
 *
 * @param {string} vr NIfTI visual review id.
 * @param {number[]} files File ids, as the server lists them.
 * @returns {number[]}
 */
export function rememberReviewOrder(vr, files) {
  const key = `${STORAGE_PREFIX}${vr}`;
  const remembered = readOrder(key);
  const seen = new Set(remembered);
  const order = [...remembered, ...files.filter((file) => !seen.has(file))];
  writeOrder(key, order);
  return order;
}

function readOrder(key) {
  try {
    const order = JSON.parse(window.sessionStorage.getItem(key));
    return Array.isArray(order) ? order : [];
  } catch (error) {
    // Unavailable storage (privacy mode) or a corrupt entry: use the server's
    // order, as before this existed.
    console.warn(
      "[niftiReviewOrder] could not read the remembered order:",
      error,
    );
    return [];
  }
}

function writeOrder(key, order) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(order));
  } catch (error) {
    console.warn("[niftiReviewOrder] could not remember the order:", error);
  }
}

/**
 * Pauses a DICOM exam's image downloads when the curator leaves it, and
 * resumes them when they come back to it.
 *
 * Cornerstone asks for every frame of an exam at once, and the DICOM loader's
 * requests can't be cancelled once sent. So leaving an exam mid-load used to
 * leave the rest of its download queued in the browser, ahead of the next
 * exam's. Now every DICOM file request is opened through `openDicomRequest`
 * (the loader's `open` hook) and sent from here instead: at most
 * MAX_IN_FLIGHT at a time, oldest first, and requests for an exam the curator
 * has left wait here unsent until that exam is loaded again. The frames
 * waiting on them simply stay pending, so Cornerstone carries on where it
 * left off.
 *
 * NIfTI files are streamed by the patched NIfTI loader and pause separately
 * (pauseNiftiFileLoad / resumeNiftiFileLoad).
 */

import { Enums, imageLoadPoolManager } from "@cornerstonejs/core";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

// A couple more than a browser's six HTTP/1.1 connections per host, so the
// connections stay busy, while leaving an exam lets only a handful of its
// frames finish ahead of the next exam's.
const MAX_IN_FLIGHT = 8;

// File URLs of every exam loaded this session, by exam key. Only a few
// thousand strings per exam, so they are kept rather than tracked for expiry.
const examUrls = new Map();
let foregroundExam = null;
let heldUrls = new Set();

// Opened requests not yet sent, oldest first: `ready` may go as soon as a
// slot frees, `held` belong to exams the curator has left.
let ready = [];
let held = [];
let inFlight = 0;
let requestCount = 0;

/**
 * The DICOM loader's `open` option: opens the request as the default does,
 * but sends it from the queue here rather than at once.
 *
 * @param {XMLHttpRequest} xhr
 * @param {string} url
 */
export function openDicomRequest(xhr, url) {
  xhr.open("get", url, true);
  const send = xhr.send.bind(xhr);
  xhr.send = (body) => {
    const request = { url, xhr, send: () => send(body), order: requestCount++ };
    (heldUrls.has(url) ? held : ready).push(request);
    sendReadyRequests();
  };
}

/**
 * Lift Cornerstone's cap on image loads in progress. Call once at startup.
 *
 * Its image-load pool counts every frame still waiting for its file as a busy
 * slot, up to 1000 per request type. A paused exam's frames wait until the
 * curator comes back, so a few exams left mid-load used to fill the pool, and
 * the exam on screen then could not start a single frame (stuck at 0%). The
 * network is throttled here instead (MAX_IN_FLIGHT), so the pool needs no cap.
 */
export function uncapImageLoadPool() {
  Object.values(Enums.RequestType).forEach((type) =>
    imageLoadPoolManager.setMaxSimultaneousRequests(type, Infinity),
  );
}

/**
 * Make `imageIds` the exam on screen: its downloads go ahead (resuming any
 * paused earlier), and every other exam's wait. Call it before the exam's
 * first image request.
 *
 * @param {string[]} imageIds
 */
export function focusExamDownloads(imageIds) {
  const key = examKey(imageIds);
  if (!examUrls.has(key)) {
    examUrls.set(key, new Set(imageIds.map(fileUrlOf).filter(Boolean)));
  }
  foregroundExam = key;
  refileRequests();
}

/**
 * The curator is leaving the exam on screen: hold its remaining downloads
 * until it is focused again.
 */
export function pauseExamDownloads() {
  foregroundExam = null;
  refileRequests();
}

function examKey(imageIds) {
  return `${imageIds.length}|${imageIds[0]}|${imageIds[imageIds.length - 1]}`;
}

// The file a wadouri image id downloads; several frames can share one file.
function fileUrlOf(imageId) {
  if (!imageId?.startsWith("wadouri:")) return null;
  return wadouri.parseImageId(imageId).url;
}

// URLs of exams other than the one on screen (a URL the on-screen exam also
// uses is not held).
function computeHeldUrls() {
  const foregroundUrls = examUrls.get(foregroundExam) ?? new Set();
  const urls = new Set();
  examUrls.forEach((examFileUrls, key) => {
    if (key === foregroundExam) return;
    examFileUrls.forEach((url) => {
      if (!foregroundUrls.has(url)) urls.add(url);
    });
  });
  return urls;
}

function refileRequests() {
  heldUrls = computeHeldUrls();
  const queued = [...ready, ...held].sort((a, b) => a.order - b.order);
  ready = queued.filter((request) => !heldUrls.has(request.url));
  held = queued.filter((request) => heldUrls.has(request.url));
  sendReadyRequests();
}

function sendReadyRequests() {
  while (inFlight < MAX_IN_FLIGHT && ready.length > 0) {
    sendRequest(ready.shift());
  }
}

function sendRequest(request) {
  inFlight += 1;
  request.xhr.addEventListener("loadend", onRequestEnd, { once: true });
  try {
    request.send();
  } catch (error) {
    // Only an unopened or already-sent request throws here; neither can
    // happen, but a leaked slot would stall every later download.
    console.error("[examDownloads] could not send", request.url, error);
    request.xhr.removeEventListener("loadend", onRequestEnd);
    inFlight -= 1;
  }
}

function onRequestEnd() {
  inFlight -= 1;
  sendReadyRequests();
}

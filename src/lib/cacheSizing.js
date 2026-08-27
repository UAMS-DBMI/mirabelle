/**
 * Size Cornerstone's image cache from the machine's memory.
 *
 * Browsers don't expose true available memory. The only broad signal is
 * navigator.deviceMemory (Chrome/Edge only): the approximate *total* device
 * RAM in GiB, quantized and capped at 8 — a 64 GB workstation still reports
 * 8. So the auto policy is deliberately conservative: half the reported RAM,
 * clamped to [0.5 GB, 4 GB]. Where the API is missing (Firefox/Safari) the
 * cache keeps Cornerstone's built-in 3 GB default.
 *
 * Machines with plenty of RAM can opt into a bigger cache (more exams kept
 * for instant back-navigation) via a localStorage override, e.g.:
 *   localStorage.setItem("mirabelle.cacheGB", "8")
 */

import * as cornerstone from "@cornerstonejs/core";

const ONE_GB = 1024 ** 3;
const OVERRIDE_KEY = "mirabelle.cacheGB";
const MIN_GB = 0.5;
const MAX_AUTO_GB = 4;
const MAX_OVERRIDE_GB = 32;

function readOverrideGb() {
  let raw;
  try {
    raw = window.localStorage?.getItem(OVERRIDE_KEY);
  } catch (error) {
    // Storage can be unavailable (e.g. privacy mode); fall back to auto.
    console.warn("[cacheSizing] localStorage unavailable:", error);
    return null;
  }
  if (!raw) return null;
  const gb = Number.parseFloat(raw);
  if (!Number.isFinite(gb) || gb < MIN_GB || gb > MAX_OVERRIDE_GB) {
    console.warn(`[cacheSizing] ignoring invalid ${OVERRIDE_KEY}:`, raw);
    return null;
  }
  return gb;
}

export function configureCacheSize() {
  const overrideGb = readOverrideGb();
  if (overrideGb) {
    cornerstone.cache.setMaxCacheSize(overrideGb * ONE_GB);
    console.log(
      `[cacheSizing] cache set to ${overrideGb} GB (${OVERRIDE_KEY} override)`,
    );
    return;
  }

  const deviceMemoryGb = navigator.deviceMemory;
  if (!deviceMemoryGb) {
    console.log(
      "[cacheSizing] navigator.deviceMemory unavailable; keeping Cornerstone's default cache size",
    );
    return;
  }

  const gb = Math.min(Math.max(deviceMemoryGb / 2, MIN_GB), MAX_AUTO_GB);
  cornerstone.cache.setMaxCacheSize(gb * ONE_GB);
  console.log(
    `[cacheSizing] device reports ${deviceMemoryGb} GB RAM (browser caps at 8); cache set to ${gb} GB`,
  );
}

export default configureCacheSize;

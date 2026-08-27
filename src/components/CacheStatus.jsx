/**
 * Live Cornerstone image-cache usage indicator for the header.
 *
 * Shows used / max cache size with a small utilization bar, so it's visible
 * at a glance how close the exam cache is to evicting older exams (see
 * makeRoomForExam in utilities.js and the sizing policy in lib/cacheSizing).
 * Polling (rather than cache events) keeps it simple and cheap: reading the
 * two counters is trivial, and per-image cache events fire thousands of
 * times while a volume streams in.
 */
import React, { useEffect, useState } from "react";

import * as cornerstone from "@cornerstonejs/core";

const POLL_MS = 1000;
const ONE_GB = 1024 ** 3;

function formatGb(bytes) {
  return (bytes / ONE_GB).toFixed(1);
}

function utilizationBarColor(fraction) {
  if (fraction > 0.9) return "bg-red-500";
  if (fraction > 0.75) return "bg-amber-500";
  return "bg-green-500";
}

function CacheStatus() {
  const [usage, setUsage] = useState({ used: 0, max: 0 });

  useEffect(() => {
    const readUsage = () => {
      const used = cornerstone.cache.getCacheSize();
      const max = cornerstone.cache.getMaxCacheSize();
      // Keep the previous state object when nothing changed so the poll
      // doesn't re-render the header every second.
      setUsage((prev) =>
        prev.used === used && prev.max === max ? prev : { used, max },
      );
    };
    readUsage();
    const timer = setInterval(readUsage, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!usage.max) return null;

  const fraction = Math.min(usage.used / usage.max, 1);

  return (
    <div
      id="cache-status"
      title={`Cornerstone image cache: ${Math.round(fraction * 100)}% used`}
      className="mx-4 text-right"
    >
      <div className="text-xs leading-tight whitespace-nowrap">
        Cache {formatGb(usage.used)} / {formatGb(usage.max)} GB
      </div>
      <div className="h-1 w-full rounded bg-blue-200 dark:bg-blue-950 overflow-hidden">
        <div
          className={`h-full rounded ${utilizationBarColor(fraction)}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

export default CacheStatus;

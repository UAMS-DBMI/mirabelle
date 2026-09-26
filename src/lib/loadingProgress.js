/**
 * Feeds the percentage shown in the app-wide loading indicator.
 *
 * A load asks for a reporter with `startLoadingProgress()` and calls it with
 * whole-number percentages. Only the newest reporter reaches the indicator,
 * and every reporter goes quiet once the spinner comes down or goes up again:
 * a volume abandoned by navigation keeps streaming in the background, and must
 * not drive the next exam's indicator.
 */

import store from "@/store";
import { setLoadingProgress } from "@/features/optionSlice";

let generation = 0;
let wasLoading = store.getState().options.loading;

store.subscribe(() => {
  const { loading } = store.getState().options;
  if (loading === wasLoading) return;
  wasLoading = loading;
  generation++;
});

/**
 * Start reporting progress for a load. Call it after the load's
 * `setLoading(true)`, which would otherwise silence it.
 *
 * @returns {(percent: number) => void}
 */
export function startLoadingProgress() {
  const reporterGeneration = ++generation;
  let lastPercent = null;
  return (percent) => {
    if (reporterGeneration !== generation || percent === lastPercent) return;
    lastPercent = percent;
    store.dispatch(setLoadingProgress(percent));
  };
}

/**
 * Whole-number percentage of `done` out of `total`, clamped to 0–100.
 *
 * @param {number} done
 * @param {number} total
 * @returns {number}
 */
export function toPercent(done, total) {
  return Math.min(Math.max(Math.floor((done / total) * 100), 0), 100);
}

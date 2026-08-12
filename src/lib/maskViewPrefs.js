/*
 * Session-local, per-IEC appearance of the mask boxes — the Mask Opacity and
 * Submitted Mask Opacity sliders and their show/hide toggles.
 *
 * Curators set this per exam, and the right value is a property of the exam
 * rather than of the session: a faint box to check the selection against the
 * anatomy underneath it, a solid one to confirm what is about to be removed.
 * Navigation resets the tool options (resetOptions in optionSlice), so
 * without this the slider snapped back to 100% on every exam and the choice
 * had to be re-made each time.
 *
 * Memory is strictly per exam. An exam that has been adjusted keeps its own
 * value when you navigate back to it; an exam that has never been adjusted
 * opens at the route default (fully opaque), NOT at whatever was set on the
 * exam before it — every new exam starts from the same known state.
 *
 * Kept for the lifetime of the tab (a plain Map, like lib/maskDrafts). This
 * is display state, not work, so — unlike a draft — it is NOT dropped when
 * the exam is submitted or skipped; coming back to a finished exam should
 * still look the way the curator left it.
 */

const views = new Map();

/** Record the box appearance the curator chose for this exam. */
export function rememberMaskView(iec, view) {
  if (iec == null || !view) return;
  views.set(String(iec), {
    opacity: view.opacity,
    visible: view.visible,
    prevOpacity: view.prevOpacity,
    prevVisible: view.prevVisible,
  });
}

/**
 * The appearance to show for this exam — both boxes, as one record: its own
 * remembered value if it has one, otherwise `fallback` — the route's default,
 * so an exam that has never been adjusted always opens at the same known state
 * rather than carrying over whatever was set on the exam before it.
 */
export function getMaskView(iec, fallback) {
  if (iec != null) {
    const stored = views.get(String(iec));
    if (stored) return stored;
  }
  return fallback;
}

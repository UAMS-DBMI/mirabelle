import * as cornerstone from "@cornerstonejs/core";

// The QC page reuses the app-wide rendering engine and stack viewport ids
// (StackViewport and the cine utilities are keyed on them).
export const RENDERING_ENGINE_ID = "re1";
export const VIEWPORT_ID = "myviewport";

/** The QC stack viewport, or undefined while it isn't mounted yet. */
export function getQCViewport() {
  const renderingEngine = cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
  return renderingEngine?.getViewport(VIEWPORT_ID);
}

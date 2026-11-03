import { useEffect } from "react";

export default function useRendererResize(renderingEngine) {
  useEffect(() => {
    if (!renderingEngine) return;

    const onResize = () => {
      const stacks = renderingEngine
        .getStackViewports()
        .filter((viewport) => viewport.getCornerstoneImage());
      const zooms = stacks.map((viewport) => viewport.getZoom());

      // first arg = force rerender, second = preserve aspect/FOV
      renderingEngine.resize(true, true);

      // Preserving the camera keeps the image's size on screen, which crops it
      // once the pane is narrower than the image. A stack keeps its zoom
      // relative to the pane's new fit instead.
      stacks.forEach((viewport, index) => {
        viewport.setZoom(zooms[index]);
        viewport.render();
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderingEngine]);
}

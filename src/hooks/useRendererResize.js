import { useEffect } from "react";

export default function useRendererResize(renderingEngine) {
  useEffect(() => {
    if (!renderingEngine) return;

    const onResize = () => {
      // first arg = force rerender, second = preserve aspect/FOV
      renderingEngine.resize(true, true);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderingEngine]);
}

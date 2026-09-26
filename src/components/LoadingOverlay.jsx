import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSelector } from "react-redux";
import LoadingSpinner from "@/components/LoadingSpinner";

import "./LoadingOverlay.css";

// Lets a mounted viewer panel tell the app-wide overlay to step aside.
const ViewerPanelContext = createContext(null);

/**
 * Shows the loading indicator while the app-wide `loading` state is true: in
 * the middle of the viewer panel when a page has one (ViewerLoadingIndicator),
 * otherwise centred over the whole window (e.g. while a review list loads,
 * before the page's layout mounts).
 */
export default function LoadingOverlay({ children }) {
  const loading = useSelector((state) => state.options.loading);
  const progress = useSelector((state) => state.options.loadingProgress);
  const [viewerPanels, setViewerPanels] = useState(0);

  const registerViewerPanel = useCallback(() => {
    setViewerPanels((count) => count + 1);
    return () => setViewerPanels((count) => count - 1);
  }, []);

  return (
    <ViewerPanelContext.Provider value={registerViewerPanel}>
      {loading && viewerPanels === 0 && (
        <div id="overlay">
          <LoadingSpinner progress={progress} />
        </div>
      )}
      {children}
    </ViewerPanelContext.Provider>
  );
}

/**
 * The loading indicator for a page's viewer panel, centred over the viewer
 * area. While it is mounted, the app-wide overlay stays hidden.
 */
export function ViewerLoadingIndicator() {
  const registerViewerPanel = useContext(ViewerPanelContext);
  const loading = useSelector((state) => state.options.loading);
  const progress = useSelector((state) => state.options.loadingProgress);

  useEffect(() => registerViewerPanel?.(), [registerViewerPanel]);

  if (!loading) return null;
  return (
    <div className="viewer-loading-indicator">
      <LoadingSpinner progress={progress} />
    </div>
  );
}

import React from "react";
import { useSelector } from "react-redux";
import LoadingSpinner from "@/components/LoadingSpinner";

import "./LoadingOverlay.css";

/**
 * Display a simple loading overlay with a spinner,
 * when the loading state is true.
 */
export default function LoadingOverlay({ children }) {
  const loading = useSelector((state) => state.options.loading);

  return (
    <>
      {loading && (
        <div id="overlay">
          <LoadingSpinner />
        </div>
      )}
      {children}
    </>
  );
}

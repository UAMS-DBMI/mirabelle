// src/hooks/useConfigState.js
import { useState } from "react";

/**
 * Custom hook to manage configuration state based on a provided initial configuration.
 * @param {Object} initialConfig - The initial configuration object for the route.
 */
export default function useConfigState(initialConfig) {
  // Initialize state based on the initialConfig provided for this route
  const [configState, setConfigState] = useState(initialConfig);

  // Generate individual setter functions for each key in configState
  const setters = Object.keys(configState).reduce((acc, key) => {
    acc[`set${key.charAt(0).toUpperCase() + key.slice(1)}`] = (value) => {
      setConfigState((prevState) => ({ ...prevState, [key]: value }));
    };
    return acc;
  }, {});

  return { ...configState, ...setters };
}

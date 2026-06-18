
/**
 * ErrorBoundary component to catch JavaScript errors in child components
 * and display a fallback UI instead of crashing the entire app.
 *
 * Usage:
 * Wrap your application or specific components with <ErrorBoundary>
 */

import React from "react";

import ErrorState from "./ErrorState";
import { messages } from "@/lib/messages";
import "./ErrorBoundary.css";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title="Something went wrong."
          message={messages.errors.generic}
          detail={this.state.error?.message}
        />
      );
    }
    return this.props.children;
  }
}

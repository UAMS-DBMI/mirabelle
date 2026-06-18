import React from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Header from "./Header";

import "./AppLayout.css";
import "./notifications.css";
import ErrorBoundary from "./ErrorBoundary";
import TestError from "./TestError";

export default function AppLayout() {
  return (

    <div id="app">
      <Toaster
        position="top-center"
        toastOptions={{
          // Base look. Colors come from CSS variables that flip with the OS
          // color scheme (see notifications.css). Per-type accents are added
          // via class names in notify.js.
          style: {
            background: "var(--toast-bg)",
            color: "var(--toast-fg)",
            boxShadow: "var(--toast-shadow)",
            borderRadius: "10px",
            padding: "12px 16px",
            maxWidth: "440px",
            fontSize: "1rem",
            lineHeight: "1.4",
          },
          success: { iconTheme: { primary: "var(--toast-success)", secondary: "var(--toast-bg)" } },
          error: {
            iconTheme: { primary: "var(--toast-error)", secondary: "var(--toast-bg)" },
            ariaProps: { role: "alert", "aria-live": "assertive" },
          },
        }}
      />
      <Header />
      <Outlet />
    </div>
  );
}

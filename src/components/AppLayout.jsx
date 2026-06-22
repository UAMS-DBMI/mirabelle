import React from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Header from "./Header";

import "./AppLayout.css";
import ErrorBoundary from "./ErrorBoundary";
import TestError from "./TestError";

export default function AppLayout() {
  return (
    <div id="app">
      <Toaster
        toastOptions={{
          style: {
            fontSize: "1.5rem",
          },
        }}
      />
      <Header />
      <Outlet />
    </div>
  );
}

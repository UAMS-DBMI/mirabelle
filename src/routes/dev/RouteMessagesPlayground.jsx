import React, { useEffect, useState } from "react";

import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";
import { ApiError } from "@/lib/http";
import ErrorState from "@/components/ErrorState";
import ViewportPlaceholder from "@/components/ViewportPlaceholder";

import "./RouteMessagesPlayground.css";

/**
 * Developer playground for visually testing every toast, message, and error UI
 * in both color schemes — no backend required.
 *
 * Route: /mira/dev/messages
 */

// A button that fires a notification when clicked.
function FireButton({ label, onClick }) {
  return (
    <button type="button" className="pg-btn" onClick={onClick}>
      {label}
    </button>
  );
}

// Throws during render so we can demonstrate the router's error fallback.
function Boom() {
  throw new Error("💥 Playground test render error");
}

const SUCCESS = [
  ["Status set", () => notify.success(messages.status.set("Good"))],
  [
    "Flagged for masking",
    () => notify.success(messages.status.flaggedForMasking),
  ],
  ["Mask accepted", () => notify.success(messages.mask.accepted)],
  ["Mask rejected", () => notify.success(messages.mask.rejected)],
  ["Mask skipped", () => notify.success(messages.mask.skipped)],
  ["Not maskable", () => notify.success(messages.mask.notMaskable)],
  ["Selection expanded", () => notify.success(messages.mask.expanded)],
  ["Submitted for masking", () => notify.success(messages.mask.submitted)],
];

const ERRORS = [
  ["Generic", () => notify.error(messages.errors.generic)],
  ["Load image", () => notify.error(messages.errors.loadImage)],
  ["Save status", () => notify.error(messages.errors.saveStatus)],
  ["Submit mask", () => notify.error(messages.errors.submitMask)],
  ["Network", () => notify.error(messages.errors.network)],
  ["Download failed", () => notify.error(messages.errors.downloadFailed)],
  ["Missing NIfTI file", () => notify.error(messages.errors.missingNiftiFile)],
  [
    "Multiple SEG images",
    () => notify.error(messages.errors.multipleSegImages(123456)),
  ],
];

const VALIDATION_NAV = [
  ["Flat selection", () => notify.info(messages.maskValidation.flatSelection)],
  ["Expand first", () => notify.info(messages.maskValidation.expandFirst)],
  ["No next (IEC)", () => notify.info(messages.navigation.noNext("IEC"))],
  [
    "No previous (file)",
    () => notify.info(messages.navigation.noPrevious("file")),
  ],
  ["No filter results", () => notify.info(messages.filters.noResults)],
  ["List load failed", () => notify.error(messages.filters.loadFailed)],
];

// Demonstrates how notify.error resolves the message from different throwables.
const THROWABLES = [
  [
    "ApiError (message + detail)",
    () =>
      notify.error(
        new ApiError(messages.errors.saveStatus, {
          status: 500,
          detail:
            "Internal Server Error: could not write status for IEC 1117950",
        }),
      ),
  ],
  [
    "Raw Error (uses fallback)",
    () =>
      notify.error(
        new Error("internal: socket hang up"),
        messages.errors.network,
      ),
  ],
  ["Bare string", () => notify.error("A plain string message.")],
];

function Section({ title, children }) {
  return (
    <section className="pg-section">
      <h2 className="pg-section__title">{title}</h2>
      {children}
    </section>
  );
}

function ButtonGrid({ items }) {
  return (
    <div className="pg-grid">
      {items.map(([label, onClick]) => (
        <FireButton key={label} label={label} onClick={onClick} />
      ))}
    </div>
  );
}

export default function RouteMessagesPlayground() {
  const [theme, setTheme] = useState("os");
  const [boom, setBoom] = useState(false);

  // Drive the message-component theming via a data attribute on <html>.
  // "os" removes the override and falls back to prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "os") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  if (boom) {
    // Caught by the router's errorElement -> ErrorPage -> ErrorState.
    return <Boom />;
  }

  return (
    <div className="pg">
      <header className="pg-header">
        <h1 className="pg-title">Messages &amp; Errors Playground</h1>
        <div className="pg-theme">
          <span className="pg-theme__label">Theme:</span>
          {["os", "light", "dark"].map((t) => (
            <button
              key={t}
              type="button"
              className={`pg-btn ${theme === t ? "pg-btn--active" : ""}`}
              onClick={() => setTheme(t)}
            >
              {t === "os" ? "OS default" : t}
            </button>
          ))}
        </div>
        <p className="pg-hint">
          The toggle previews the messaging components. For a fully faithful
          app-wide check, use DevTools → Rendering → “Emulate
          prefers-color-scheme”.
        </p>
      </header>

      <Section title="Success">
        <ButtonGrid items={SUCCESS} />
      </Section>

      <Section title="Errors">
        <ButtonGrid items={ERRORS} />
      </Section>

      <Section title="Validation & navigation">
        <ButtonGrid items={VALIDATION_NAV} />
      </Section>

      <Section title="Info & loading">
        <div className="pg-grid">
          <FireButton
            label="Info"
            onClick={() => notify.info("Heads up — this is an info toast.")}
          />
          <FireButton
            label="Loading → success (2.5s)"
            onClick={() => {
              const id = notify.loading(messages.loading.segVolume);
              setTimeout(() => {
                notify.dismiss(id);
                notify.success(messages.mask.submitted);
              }, 2500);
            }}
          />
          <FireButton label="Dismiss all" onClick={() => notify.dismiss()} />
        </div>
      </Section>

      <Section title="Error resolution (notify.error inputs)">
        <ButtonGrid items={THROWABLES} />
      </Section>

      <Section title="In-view components">
        <div className="pg-previews">
          <div className="pg-preview">
            <div className="pg-preview__caption">ViewportPlaceholder</div>
            <div className="pg-preview__stage">
              <ViewportPlaceholder />
            </div>
          </div>
          <div className="pg-preview">
            <div className="pg-preview__caption">
              ErrorState (with detail + retry)
            </div>
            <div className="pg-preview__stage">
              <ErrorState
                detail="TypeError: Cannot read properties of undefined (reading 'frames')"
                onRetry={() => notify.info("Retry clicked.")}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Full-page fallback">
        <p className="pg-hint">
          Throws a render error caught by the router’s error boundary (the
          themed ErrorState full-page fallback). Use the browser Back button to
          return.
        </p>
        <button
          type="button"
          className="pg-btn pg-btn--danger"
          onClick={() => setBoom(true)}
        >
          Trigger render error
        </button>
      </Section>
    </div>
  );
}

# AGENTS.md

Guidance for AI coding agents working in the Mirabelle repository.

## What this is

Mirabelle is a browser-based medical-image viewer for **de-identifying (removing PHI from)
DICOM and NIfTI image volumes**. It is used by the Department of Biomedical Informatics at
the University of Arkansas for Medical Sciences (UAMS). It is a single-page React app; there
is no backend in this repo — it talks to an external API (see [Backend](#backend)).

The app is served under the URL base path **`/mira`** (note the React Router `basename`
and webpack `publicPath`), typically behind nginx in deployment.

## Tech stack

- **React 19** SPA, **React Router v7** (`createBrowserRouter`, data-router loaders).
- **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) for state.
- **Cornerstone3D** (`@cornerstonejs/*` v3.33.4) for DICOM/NIfTI rendering, tools, and
  segmentation. This is the heart of the app.
- **webpack 5** for bundling and the dev server; **Babel** (`preset-env`, `preset-react`).
- **Tailwind CSS v3** + PostCSS, alongside per-component `.css` files.
- **Vitest** (+ Testing Library, jsdom) for tests.
- **Bun** is the package manager / task runner (`bun.lock`). Node is not used to run scripts.

## Commands

Use the Makefile (it wraps bun) or bun directly:

```bash
make serve      # webpack dev server against the UAMS backend (the default `make` target)
make serve ENV=development   # ...against a local backend  (ENV: development | production | aries)
make build      # bun run build  -> production-ish webpack build
make node_modules   # bun install --frozen-lockfile  (equivalent of `npm ci`)
make clean      # rm -rf node_modules dist

bun run start   # webpack serve directly
bun run test    # bunx vitest -> run tests (watch mode)
bunx vitest run # single, non-watch test run
```

- The dev server opens at `http://localhost:8082/mira` per `.vscode/` config, or webpack's
  default port otherwise. It sets COOP/COEP cross-origin-isolation headers (required for
  Cornerstone's WASM/SharedArrayBuffer paths) — keep those if you touch `devServer`.
- `MIRABELLE_COMMIT` env var is baked in as `__COMMIT_HASH__` at build time (logged to
  console on startup). It defaults to `'unknown'`.

## Dependency patches (important)

This project **patches `node_modules` via `patch-package`**, run automatically as a
`postinstall` hook. See `patches/`:

- `@cornerstonejs+nifti-volume-loader+3.33.4.patch` — adds FLOAT64 NIfTI support and fixes
  skewed images.
- `@cornerstonejs+core+3.33.4.patch` — backports Float64 volume support.

If you change a `@cornerstonejs` dependency or need to alter its behavior, update the patch
(`bunx patch-package @cornerstonejs/<pkg>`) rather than editing `node_modules` directly.
Do not bump `@cornerstonejs` versions without regenerating these patches.

## Project structure

`docs/src-file-structure.md` has a full file-by-file tree; keep it roughly in sync if you
add/move files. High level (`src/`):

- `index.js` — true entrypoint: builds the Redux `Provider`, `EnableCornerstone`,
  `LoadingOverlay`, and the `createBrowserRouter` route table (all routes live here).
- `routes/` — thin route components + React Router `loader` functions. Grouped by domain:
  `mask/`, `mask-review/`, `dicom/`, `nifti/`. Each route dispatches a Redux config action
  then renders the matching `features/` component.
- `features/` — the real feature UI and the Redux **slices** (`counterSlice`,
  `presentationSlice`, `maskingSlice`, `optionSlice`). Subfolders: `mask/`, `mask-review/`,
  `dicom-review/`, `nifti-review/`, `seg/`, `tools/`, `stack-view/`, `volume-view/`,
  `details/`. Most expose an `index.js` barrel.
- `components/` — shared UI (viewports, panels, layout, Cornerstone bootstrap). Each
  component is a `.jsx` + sibling `.css` pair.
- `config/config.js` — declarative per-task UI configuration (`TASK_CONFIGS`): which panels
  and tools are visible for each layout (Masker, MaskerReview, VisualReview) × viewport
  layout (stack/volume). `config_old.js` is legacy/deprecated.
- `store.js` — Redux store wiring the four slices.
- `masking.js`, `visualreview.js`, `utilities.js` — API calls and coordinate/volume math.
  `masking.test.js` covers `convertCoordinates`.
- `hooks/`, `lib/` — custom hooks and Cornerstone image-id/metadata helpers.

### Domain vocabulary

- **IEC** — a viewing-orientation view (the app's 2D/stack-oriented review mode).
- **VR** — Volume Rendering (3D).
- **Masker / Masker Review / Visual Review** — the three workflow layouts (mask creation,
  mask QA, and DICOM/NIfTI visual review), each driven by a `TASK_CONFIGS` entry.
- Routes encode workflow + view in the path, e.g. `mask/vr/:vr/:iec/:maskingStatus`,
  `review/dicom/iec/:iec`, `review/nifti/vr/:vr/:file`.

## Backend

The app calls an external API proxied by the webpack dev server:

- **`/papi/...`** — the application API (POSDA). Endpoints used live in `masking.js`,
  `visualreview.js`, and `utilities.js` (e.g. `/papi/v1/iecs/:iec/info`,
  `/papi/v1/masking/:iec`, `/papi/v1/nifti/:file_id`, `/papi/v1/wadors` for DICOMweb).
- **`/files/...`** — static image files served by nginx; referenced as
  `wadouri:/files/<path>` image ids.

The proxy is configured in `webpack.config.js` under `devServer.proxy`, which reads
`MIRA_API_TARGET` and `MIRA_API_TOKEN` from the environment. Those come from per-environment
`.env` files (`.env.development` = localhost, `.env.production` = UAMS, `.env.aries`), loaded
by bun via `bun --env-file=.env.<ENV>` — driven by the Makefile's `ENV` variable
(`make serve ENV=aries`). Personal overrides go in a gitignored `.env.local`; `.env.example`
documents the variables. The committed tokens are non-sensitive dev/test tokens.

## Conventions

There is no enforced linter and no lint/format npm script, though **Prettier 3 is installed**
— match the existing code and optionally run `bunx prettier` on files you touch.

De-facto style in this codebase:

- 2-space indentation, semicolons, double quotes in newer files (some older files use
  single quotes — follow the file you're in).
- Functional React components with hooks. Redux via Toolkit slices + `useSelector` /
  `useDispatch`.
- Use the **`@/` import alias** for `src/` (configured in webpack `resolve.alias`,
  `jsconfig.json`, and Babel) instead of long relative paths.
- Component = `Foo.jsx` + sibling `Foo.css`, imported at the top of the component.
- Route modules export a default component and (where data is loaded) a named `loader`.

## Working notes for agents

- This is **JavaScript/React**, not Python — ignore any global Python/uv/pytest defaults
  here; they don't apply.
- When adding a route, register it in the route table in `src/index.js` and add the
  component under `routes/` + `features/`.
- When adding UI to a workflow, you usually also touch `config/config.js` to make the
  relevant panel/tool visible for that `TASK_CONFIGS` layout.
- Keep the COOP/COEP headers and the `asyncWebAssembly` experiment in webpack — Cornerstone
  segmentation (polyseg / itk-wasm) depends on cross-origin isolation and WASM.
- Don't commit or push unless explicitly asked.

# Mirabelle — Improvement Backlog

A prioritized list of suggested improvements / tech-debt remediation. Line references are
approximate and may drift as the code changes.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 🔴 Build / config — address first

- [ ] **Move proxy config (target + token) into `.env` files** (`webpack.config.js:83-108`).
  The committed bearer tokens are *not* real production credentials (per the dev team), so
  this is config hygiene rather than a credential leak — no rotation needed. Goals:
  - Read `process.env.MIRA_API_TARGET` / `MIRA_API_TOKEN` in `webpack.config.js` instead of
    hardcoding. The proxy runs in Node at config-eval time, so bun's built-in `.env` loading
    is enough — no `dotenv` dependency or `DefinePlugin` required.
  - Use per-environment files (`.env.development`, `.env.production`, plus ARIES), selected by
    `NODE_ENV` / a custom `MIRA_ENV`, with `.env*.local` gitignored and a committed
    `.env.example`. This also replaces the current commenting/uncommenting of proxy blocks.

- [ ] **Don't hardcode `mode: 'development'`** (`webpack.config.js:6`). `make build` currently
  ships an unminified dev-React bundle with full source maps. Drive `mode` from
  `argv.mode` / `NODE_ENV` so `bun run build` produces an optimized production bundle.

## 🟠 Engineering hygiene

- [ ] **Add CI** (none today — would be a new adoption; GitHub Actions is the likely choice
  if the repo stays on GitHub). Minimal pipeline:
  `bun install --frozen-lockfile && bunx vitest run && bun run build`. Especially important
  because the `patch-package` patches break silently on dependency drift.

- [ ] **Increase test coverage.** Only `src/masking.test.js` exists (~9,200 lines of source).
  It covers `convertCoordinates` (the risky math); the rest of `utilities.js`, the Redux
  slices, and the masking workflow are untested.

- [ ] **Pin tool versions.** No `engines` field and no `.nvmrc`. Pin bun/node so contributors
  and CI match — relevant since patches target an exact Cornerstone version.

## 🟡 Maintainability

- [ ] **Delete dead code (~1,400 lines).**
  - `src/viewer.js` (~901 lines) — not imported anywhere; only a commented-out webpack entry
    (`webpack.config.js:7`). Appears to be the pre-refactor entrypoint.
  - `src/config/config_old.js` (~513 lines) — referenced nowhere.

- [ ] **Reduce shipped logging.** ~115 `console.*` calls across `src` end up in the bundle.
  Gate behind `debug.js` or strip in production builds.

- [ ] **Split oversized files** (vs. the small-function preference): `utilities.js` (~741,
  mixes API fetches + volume math + image-id construction), `MaskIEC.jsx` (~588),
  `DicomReviewIEC.jsx` (~507), `presentationSlice.js` (~412).

- [ ] **Enforce lint/format.** Prettier is installed but unscripted; no ESLint. Style is
  inconsistent (e.g. `utilities.js` is tab-indented/single-quoted; `index.js` is
  2-space/double-quoted). Add a committed Prettier config + ESLint with
  `eslint-plugin-react-hooks` (relevant given the `useEffect(..., [])` patterns in routes).

- [ ] **Fix stale `package.json` metadata.** Empty `description`/`author`; `license: "ISC"`
  (likely unintended for a UAMS internal tool); `"main": "index.js"` points at a
  non-existent root file.

---

## Suggested order

1. Rotate + remove tokens (security, quick)
2. Fix the production build mode (quick, high-leverage)
3. Add a minimal CI workflow
4. Delete dead code (makes everything else easier to reason about)

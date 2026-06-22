# Mirabelle — Improvement Backlog

A prioritized list of suggested improvements / tech-debt remediation. Line references are
approximate and may drift as the code changes.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 🔴 Security / correctness — address first

- [ ] **Remove live API bearer tokens from `webpack.config.js`** (`:94`, `:100`; commented at
  `:88`, `:106`). Real tokens and internal UAMS hostnames are committed to git.
  - Move secrets/targets to a gitignored `.env` / `webpack.config.local.js`.
  - **Rotate** the exposed tokens — deleting them from the current file does not remove them
    from git history.

- [ ] **Don't hardcode `mode: 'development'`** (`webpack.config.js:6`). `make build` currently
  ships an unminified dev-React bundle with full source maps. Drive `mode` from
  `argv.mode` / `NODE_ENV` so `bun run build` produces an optimized production bundle.

- [ ] **Stop switching environments by commenting/uncommenting proxy blocks**
  (`webpack.config.js:83-108`). Local / PROD / ARIES should be selected via an env var, not
  hand-edited (easy to commit the wrong target).

## 🟠 Engineering hygiene

- [ ] **Add CI** (no `.github/workflows` today). Minimal pipeline:
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

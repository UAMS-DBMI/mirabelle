# Mirabelle — Improvement Backlog

A prioritized list of suggested improvements / tech-debt remediation. Line references are
approximate and may drift as the code changes.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 🔴 Build / config — address first

- [x] **Move proxy config (target + token) into `.env` files** (was `webpack.config.js:83-108`).
  Done: `webpack.config.js` reads `MIRA_API_TARGET` / `MIRA_API_TOKEN` from the environment
  (required only when serving); per-environment files `.env.development` / `.env.production` /
  `.env.aries` are loaded via `bun --env-file=.env.$(ENV)` from the Makefile
  (`make serve ENV=...`); `.env.local` is gitignored and `.env.example` documents the vars.
  No `dotenv`/`DefinePlugin` needed. The committed tokens are non-sensitive dev/test tokens.

- [x] **Don't hardcode `mode: 'development'`** (was `webpack.config.js:6`). Done: the config
  is now a function that reads `argv.mode`; `start`/`build` scripts pass
  `--mode development` / `--mode production`, so `bun run build` produces a minified
  production bundle (devtool also switches: `source-map` in prod, `eval-source-map` in dev).

## 🟠 Engineering hygiene

- [ ] **Add CI** (none today — would be a new adoption; GitHub Actions is the likely choice
  if the repo stays on GitHub). Minimal pipeline:
  `bun install --frozen-lockfile && bunx vitest run && bun run build`. Especially important
  because the `patch-package` patches break silently on dependency drift.

- [ ] **Increase test coverage.** Only `src/masking.test.js` exists (~9,200 lines of source).
  It covers `convertCoordinates` (the risky math); the rest of `utilities.js`, the Redux
  slices, and the masking workflow are untested.

- [x] **Pin tool versions.** Done: added a `package.json` `engines` floor (`bun >=1.3.0`,
  `node >=22.0.0`) and a `.tool-versions` file (`bun 1.3`, `nodejs 22`) for mise/asdf.
  Floors rather than exact pins; Node floored at 22 since 20 is EOL (April 2026). Because
  bun does not enforce `engines`, a `check-tools` Makefile target (order-only prereq of
  `node_modules`) actually fails serve/build/install on a too-old bun/node.

## 🟡 Maintainability

- [x] **Delete dead code (~1,400 lines).** Done: removed `src/viewer.js` (~901 lines, the
  pre-refactor entrypoint, unimported) and `src/config/config_old.js` (~513 lines, unreferenced).
  Build verified green afterward; docs updated.

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

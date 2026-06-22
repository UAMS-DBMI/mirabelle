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

- [x] **Add CI.** Done: GitHub Actions workflow (`.github/workflows/ci.yml`) with three
  parallel jobs — `lint` (non-blocking via `continue-on-error`), `test` (`vitest run`), and
  `build` (`webpack --mode production`) — on push to main/develop and on PRs. Each does a
  frozen `bun install` (so the `patch-package` postinstall is exercised). NOTE: the `test`
  job is red until the `masking.test.js` failures are resolved.

- [ ] **Increase test coverage.** Only `src/masking.test.js` exists (~9,200 lines of source).
  It covers `convertCoordinates` (the risky math); the rest of `utilities.js`, the Redux
  slices, and the masking workflow are untested.
  - **⚠️ The existing test file is currently failing** — all 5 `convertCoordinates`
    `toBeCloseTo` assertions fail (pre-existing, unrelated to formatting). Either the test
    or `convertCoordinates` drifted; needs investigation before a CI `test` job goes green.

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

- [x] **Enforce lint/format.** Done: added Prettier config (`.prettierrc.json`) + ESLint
  flat config (`eslint.config.js`, with `eslint-plugin-react-hooks`) and `lint`/`format`/
  `format:check` scripts. Reformatted the whole tree once (recorded in
  `.git-blame-ignore-revs`). Lint is intended to run **non-blocking** in CI. NOTE: ESLint
  surfaced ~13 errors worth a look later (e.g. `cornerstone`/`process` used as undefined
  globals, unreachable code).

- [x] **Fix stale `package.json` metadata.** Done: added a real `description`, set
  `author` to UAMS-DBMI, changed `license` to `MIT` (+ added a `LICENSE` file), removed the
  bogus `"main": "index.js"`, and added `"private": true` (app, not a published package).

---

## Suggested order

1. Rotate + remove tokens (security, quick)
2. Fix the production build mode (quick, high-leverage)
3. Add a minimal CI workflow
4. Delete dead code (makes everything else easier to reason about)

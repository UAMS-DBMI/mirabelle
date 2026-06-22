// ESLint flat config (v9). Lints src/ only (run via `bun run lint`).
// Prettier owns formatting; eslint-config-prettier disables conflicting
// stylistic rules so the two don't fight.
const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const prettier = require("eslint-config-prettier");

module.exports = [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        // Injected by webpack DefinePlugin.
        __COMMIT_HASH__: "readonly",
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      // Lots of pre-existing unused vars; surface as warnings, not errors.
      "no-unused-vars": "warn",
      // Mark JSX-referenced components/React as used so no-unused-vars is sane.
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      // The rules that actually catch hook bugs.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Test files use Vitest globals (globals: true in vitest.config.js).
    files: ["src/**/*.test.{js,jsx}", "src/test/**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  prettier,
];

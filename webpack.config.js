const path = require("path");
const http = require("http");
const https = require("https");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

// Backend the dev server proxies /papi and /files to. Provided via .env files,
// loaded by bun (see `make serve ENV=...`). Only required when running the dev
// server (`webpack serve`); a plain build doesn't use the proxy.
const apiTarget = process.env.MIRA_API_TARGET;
const apiToken = process.env.MIRA_API_TOKEN;

// Reuse backend connections across the hundreds of frame requests a single
// exam load fires through the dev proxy; without an explicit keep-alive
// agent each proxied request can pay a fresh TCP (+TLS) handshake to the
// remote backend, which dominates load time on high-latency links.
const proxyAgent = apiTarget?.startsWith("https")
  ? new https.Agent({ keepAlive: true, maxSockets: 16, maxFreeSockets: 16 })
  : new http.Agent({ keepAlive: true, maxSockets: 16, maxFreeSockets: 16 });

if (process.env.WEBPACK_SERVE === "true" && (!apiTarget || !apiToken)) {
  throw new Error(
    "Missing MIRA_API_TARGET / MIRA_API_TOKEN. Run via `make serve` (which loads " +
      ".env.<ENV> through bun --env-file), or copy .env.example to set them.",
  );
}

module.exports = (env, argv) => {
  // Mode comes from the `--mode` flag (see the start/build npm scripts); fall back
  // to development when running the dev server, production otherwise.
  const mode =
    argv.mode ||
    (process.env.WEBPACK_SERVE === "true" ? "development" : "production");
  const isProduction = mode === "production";

  return {
    mode,
    // Separate source maps in prod (debuggable, not inlined); fast rebuilds in dev.
    devtool: isProduction ? "source-map" : "eval-source-map",
    entry: "./src/index.js",
    output: {
      //path: path.resolve(__dirname, 'dist'),
      publicPath: "/mira/",
      //clean: true,
      filename: "bundle.js",
    },
    resolve: {
      extensions: [".jsx", "..."],
      fallback: {
        fs: false,
        tls: false,
        net: false,
        path: false,
        zlib: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
      },
      // Allow "absolute" imports beginning with @
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    experiments: {
      asyncWebAssembly: true,
      // syncWebAssembly: true,
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
        {
          test: /\.wasm/,
          type: "asset/resource",
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          use: [
            {
              loader: "file-loader",
              options: {
                name: "[name].[hash].[ext]",
                outputPath: "images",
              },
            },
          ],
        },
      ],
    },
    devServer: {
      open: ["/mira/"],
      client: {
        overlay: {
          // Keep the overlay for compile errors, but don't let runtime errors
          // (handled globally and surfaced as toasts) hijack the page.
          errors: true,
          warnings: false,
          runtimeErrors: false,
        },
      },
      historyApiFallback: {
        index: "/mira/index.html",
      },
      static: {
        directory: path.join(__dirname, "public"),
        publicPath: "/mira/",
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      proxy: [
        {
          // /papi (POSDA API): auth header, no caching — API responses change.
          // Target + token come from the active .env file.
          context: ["/papi"],
          target: apiTarget,
          agent: proxyAgent,
          headers: { Authorization: `Bearer ${apiToken || ""}` },
        },
        {
          // /files (nginx static DICOM files): same backend + auth, but mark
          // the responses long-lived so the browser's disk cache can serve
          // re-downloads of exams the in-app exam cache has evicted. The
          // paths are content-hashed, so a URL's bytes never change — safe to
          // cache aggressively.
          context: ["/files"],
          target: apiTarget,
          agent: proxyAgent,
          headers: { Authorization: `Bearer ${apiToken || ""}` },
          onProxyRes: (proxyRes) => {
            proxyRes.headers["cache-control"] =
              "public, max-age=604800, immutable";
          },
        },
      ],
      // historyApiFallback: true, // This helps with routing; ensure it's true if using React Router
      // compress: true,
    },
    optimization: {
      // Strip debug-level console calls from production bundles. console.warn /
      // console.error are kept (real error reporting). Some console.log calls
      // are arguably worth promoting to warn/error so they survive — that's a
      // follow-up; for now nothing at log/info/debug level ships to prod.
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: { drop_console: ["log", "info", "debug"] },
          },
        }),
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "src/index.html",
      }),
      new webpack.DefinePlugin({
        // every `process.env.PUBLIC_URL` in your source becomes "/mira" (or whatever you set)
        "process.env.PUBLIC_URL": JSON.stringify("/mira"),
      }),
      new webpack.DefinePlugin({
        __COMMIT_HASH__: JSON.stringify(
          process.env.MIRABELLE_COMMIT || "unknown",
        ),
      }),
    ],
  };
};

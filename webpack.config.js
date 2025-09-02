const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const { execSync } = require("child_process");

// Get the short commit SHA
const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

module.exports = {
  mode: 'development',  // Set to 'production' or 'development' as needed
  // entry: './src/viewer.js',
  // devtool: 'inline-source-map',
  devtool: 'source-map',
  entry: './src/index.js',
  output: {
    //path: path.resolve(__dirname, 'dist'),
    publicPath: '/mira/',
    //clean: true,
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.jsx', '...'],
    fallback: {
        "fs": false,
        "tls": false,
        "net": false,
        "path": false,
        "zlib": false,
        "http": false,
        "https": false,
        "stream": false,
        "crypto": false,
    },
    // Allow "absolute" imports beginning with @
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }
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
          loader: 'babel-loader'
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      },
      { 
        test: /\.wasm/,
        type: 'asset/resource'
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[hash].[ext]',
              outputPath: 'images',
            },
          },
        ],
      },
    ]
  },
  devServer: {
    open: ['/mira/'],
    historyApiFallback: {
		index: '/mira/index.html',
	},
    static: {
      directory: path.join(__dirname, 'public'),
	  publicPath: '/mira/',
    },
    headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    proxy: [
            // {
            //     // Local
            //     context: ['/papi'],
            //     target: 'http://localhost',
            //     headers: { 'Authorization': 'Bearer e9a63bc2-bfa5-4299-afb3-c844fb2ef38b' },
            // },
            {
                // PROD
                context: ['/papi'],
                target: 'http://tcia-posda-rh-1.ad.uams.edu',
                headers: { 'Authorization': 'Bearer e9a63bc2-bfa5-4299-afb3-c844fb2ef38b' },
            },
            //{
            //    // ARIES
            //    context: ['/papi'],
            //    target: 'http://aries-posda-a1.ad.uams.edu',
            //    headers: { 'Authorization': 'Bearer fcda15e2-297e-4893-984c-d2667371d9f5' },
            //},
        ],
    // historyApiFallback: true, // This helps with routing; ensure it's true if using React Router
    // compress: true,
  },
   plugins: [
      new HtmlWebpackPlugin({
          template: 'src/index.html'
      }),
      new webpack.DefinePlugin({
        // every `process.env.PUBLIC_URL` in your source becomes "/mira" (or whatever you set)
        'process.env.PUBLIC_URL': JSON.stringify("/mira"),
      }),
      new webpack.DefinePlugin({
        __COMMIT_HASH__: JSON.stringify(commitHash),
      }),
  ],
};

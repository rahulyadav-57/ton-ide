/** @type {import('next').NextConfig} */

const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const withTM = require("next-transpile-modules")(["monaco-editor"]);

const nextConfig = withTM({
  reactStrictMode: true,
  webpack: (config, options) => {
    config.resolve.fallback = { fs: false };
    if (!options.isServer) {
      config.plugins.push(
        new MonacoWebpackPlugin({
          languages: ["typescript"],
          filename: "static/[name].worker.js",
        })
      );
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
});

module.exports = nextConfig;

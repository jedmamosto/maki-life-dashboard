import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Ensure dynamic <link rel="manifest"> and apple-web-app meta tags are emitted in <head>
  // rather than streamed into <body>, which breaks iOS Safari and Android Chrome PWA detection.
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["web-push"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

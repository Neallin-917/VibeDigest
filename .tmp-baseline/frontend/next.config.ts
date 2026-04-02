import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from '@next/bundle-analyzer';
import path from "path";
import { loadEnvConfig } from '@next/env';

// Load environment variables from the root directory
const projectRoot = path.resolve(__dirname, "..");
loadEnvConfig(projectRoot);

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Allow cross-origin requests from localhost during development
  // Required for Next.js 15+ security updates
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Allow custom build directory for testing to avoid lock conflicts
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Keep workspace root anchored to the frontend folder for module resolution.
  // This avoids Tailwind resolving from the monorepo root when multiple lockfiles exist.
  turbopack: {
    root: __dirname,
  },
  /* config options here */
  images: {
    minimumCacheTTL: 60 * 60 * 24, // Cache images for 24 hours
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "**.hdslb.com" },
      { protocol: "http", hostname: "**.hdslb.com" },
      { protocol: "https", hostname: "**.biliimg.com" },
      { protocol: "http", hostname: "**.biliimg.com" },
      { protocol: "https", hostname: "p16-sign-sg.tiktokcdn.com" },
      { protocol: "https", hostname: "p16-sign-va.tiktokcdn.com" },
      // Apple Podcasts images
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      // Xiaoyuzhou images
      { protocol: "https", hostname: "image.xyzcdn.net" },
      { protocol: "http", hostname: "image.xyzcdn.net" },
      { protocol: "https", hostname: "**.xyzcdn.net" },
      { protocol: "http", hostname: "**.xyzcdn.net" },
    ],
  },
  // Proxy /lg/* requests to LangGraph server for chat functionality
  async rewrites() {
    return [
      {
        source: "/lg/:path*",
        destination: "http://localhost:8123/:path*",
      },
    ];
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config) => {
    const resolveModules = config.resolve?.modules ?? [];
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...resolveModules,
    ];
    return config;
  },
};

export default (process.env.NEXT_DIST_DIR === '.next-test' || process.env.NODE_ENV === 'test')
  ? bundleAnalyzer(nextConfig)
  : withSentryConfig(bundleAnalyzer(nextConfig), {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    org: "personal-haoran",
    project: "vibedigest-frontend",

    // Tree-shake Sentry debug logging statements to reduce bundle size
    // Replaces deprecated `disableLogger` option
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  });

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Gzip/Brotli compression for all responses (PERF1). This is Next's own default, but the flag
    // was absent from this config — making it explicit so it can't silently regress.
    compress: true,
    // instrumentation.ts is stable since Next 15 — the experimental.instrumentationHook flag was
    // removed (passing it now warns as an unrecognized key).
    typescript: {
          ignoreBuildErrors: true,
    },
    eslint: {
          ignoreDuringBuilds: true,
    },
    images: {
          // remotePatterns replaces the deprecated `domains` array (removed in Next 16).
          remotePatterns: [
                  { protocol: 'https', hostname: 'arweave.net' },
                  { protocol: 'https', hostname: 'nftstorage.link' },
                  { protocol: 'https', hostname: 'ipfs.io' },
                  { protocol: 'https', hostname: 'gateway.irys.xyz' },
          ],
    },
    webpack: (config, { isServer }) => {
          config.resolve.fallback = {
                  ...config.resolve.fallback,
                  fs: false,
                  net: false,
                  tls: false,
                  'utf-8-validate': false,
                  bufferutil: false,
          };
          // onnxruntime-web (pulled in by @imgly/background-removal) ships ESM .mjs that uses
          // import.meta + top-level import/export. Webpack's prod build defaults .mjs to
          // strict "fullySpecified" ESM resolution and chokes ("'import.meta' cannot be used
          // outside of module code"). Relax it so these modules resolve as auto-detected ESM.
          config.module.rules.push({
                  test: /\.m?js$/,
                  type: 'javascript/auto',
                  resolve: { fullySpecified: false },
          });
          // onnxruntime-web (via @imgly cutout) does `new URL(x, import.meta.url)` at module scope to
          // locate its wasm/worker. Webpack rewrites that to its RelativeURL runtime helper, which calls
          // url.replace() — and here the arg arrives non-string, throwing "url.replace is not a function"
          // and killing background removal. Disable webpack's new URL() asset parsing FOR ORT ONLY so the
          // call runs natively (import.meta.url is a real string at runtime). Scoped to onnxruntime-web to
          // avoid touching Next's own asset handling.
          config.module.rules.push({
                  test: /onnxruntime-web[\\/].*\.m?js$/,
                  parser: { url: false },
          });
          // The cutout runs only in the browser. Keep onnxruntime-web out of the server bundle so
          // SSR/route compilation never parses its WebGPU/WASM backend.
          if (isServer) {
                  config.externals = [...(config.externals || []), 'onnxruntime-web'];
          }
          return config;
    },
    async headers() {
          const csp = [
                  "default-src 'self'",
                  // blob: lets onnxruntime-web (via @imgly) dynamically import its WASM backend module
                  // from a blob: URL; without it the cutout fails with "no available backend found".
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.stripe.com https://js.privy.io https://js.moov.io",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "font-src 'self' https://fonts.gstatic.com",
                  "img-src 'self' data: blob: https://arweave.net https://nftstorage.link https://ipfs.io https://gateway.irys.xyz https://*.supabase.co",
                  // *.sentry.io lets the browser SDK POST client-side errors to the ingest endpoint.
                  "connect-src 'self' blob: data: https://*.supabase.co https://api.privy.io https://auth.privy.io https://*.helius-rpc.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://js.stripe.com https://api.stripe.com https://api.coingecko.com https://staticimgly.com https://*.sentry.io https://api.moov.io https://*.moov.io",
                  "frame-src https://js.stripe.com https://auth.privy.io https://*.moov.io",
                  // @imgly / onnxruntime-web run inference in a Web Worker created from a blob: URL; without
                  // an explicit worker-src this falls back to default-src 'self' and the worker is blocked.
                  "worker-src 'self' blob:",
                  "object-src 'none'",
                  "base-uri 'self'",
                  // Modern superset of X-Frame-Options. 'self' allows SAME-ORIGIN framing (the SDK demo
                  // shop embeds /sdk/checkout in an in-page modal iframe) while still blocking any EXTERNAL
                  // site from framing us (clickjacking). Same-origin framing adds no attack surface a
                  // same-origin XSS wouldn't already have.
                  "frame-ancestors 'self'",
          ].join('; ');

          const securityHeaders = [
                  { key: 'X-Content-Type-Options', value: 'nosniff' },
                  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                  { key: 'X-XSS-Protection', value: '1; mode=block' },
                  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                  { key: 'Content-Security-Policy', value: csp },
          ];

          if (process.env.NODE_ENV === 'production') {
                  securityHeaders.push({
                          key: 'Strict-Transport-Security',
                          value: 'max-age=63072000; includeSubDomains; preload',
                  });
          }

          return [
                  {
                          source: '/:path*',
                          headers: securityHeaders,
                  },
          ];
    },
};

// Source-map upload only happens when SENTRY_AUTH_TOKEN is set (CI); otherwise it's skipped and the
// build still succeeds. silent keeps the build log clean.
module.exports = withSentryConfig(nextConfig, {
    org: 'visby-inc',
    project: 'javascript-nextjs',
    silent: true,
    widenClientFileUpload: true,
});

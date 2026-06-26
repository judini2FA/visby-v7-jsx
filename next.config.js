/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    typescript: {
          ignoreBuildErrors: true,
    },
    eslint: {
          ignoreDuringBuilds: true,
    },
    images: {
          domains: [
                  'arweave.net',
                  'nftstorage.link',
                  'ipfs.io',
                  'gateway.irys.xyz',
                ],
    },
    webpack: (config) => {
          config.resolve.fallback = {
                  ...config.resolve.fallback,
                  fs: false,
                  net: false,
                  tls: false,
                  'utf-8-validate': false,
                  bufferutil: false,
          };
          return config;
    },
    async headers() {
          const csp = [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://js.privy.io",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "font-src 'self' https://fonts.gstatic.com",
                  "img-src 'self' data: blob: https://arweave.net https://nftstorage.link https://ipfs.io https://gateway.irys.xyz https://*.supabase.co",
                  "connect-src 'self' https://*.supabase.co https://api.privy.io https://auth.privy.io https://*.helius-rpc.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://js.stripe.com https://api.stripe.com https://api.coingecko.com",
                  "frame-src https://js.stripe.com https://auth.privy.io",
                  "object-src 'none'",
                  "base-uri 'self'",
          ].join('; ');

          const securityHeaders = [
                  { key: 'X-Content-Type-Options', value: 'nosniff' },
                  { key: 'X-Frame-Options', value: 'DENY' },
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

module.exports = nextConfig;

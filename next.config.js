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
};

module.exports = nextConfig;

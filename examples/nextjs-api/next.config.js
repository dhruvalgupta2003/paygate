/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Run PayGate middleware on the Node runtime (not Edge) because the
    // in-repo @paygate/node package uses ioredis. For Edge deployments,
    // swap in an Upstash Redis client via `redisRest`.
    serverComponentsExternalPackages: ['@paygate/node', 'ioredis'],
  },
};

module.exports = nextConfig;

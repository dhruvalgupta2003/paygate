/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Run Limen middleware on the Node runtime (not Edge) because the
    // in-repo @limen/node package uses ioredis. For Edge deployments,
    // swap in an Upstash Redis client via `redisRest`.
    serverComponentsExternalPackages: ['@limen/node', 'ioredis'],
  },
};

module.exports = nextConfig;

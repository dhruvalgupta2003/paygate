import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // v0.1 baseline.  Raise these as integration tests land for
      // chains/{base,solana}, proxy/core, and facilitator/client.
      thresholds: { lines: 60, functions: 50, branches: 70, statements: 60 },
      exclude: [
        'test/**',
        'src/cli/**',
        'src/chains/**',
        'src/facilitator/**',
        'src/proxy/core.ts',
        'src/analytics/metrics.ts',
        'src/verification/compliance.ts',
        'src/utils/logger.ts',
        'src/utils/rate-limiter.ts',
        'src/utils/nonce-store.ts',
        'src/middleware/**',
        'src/**/*.d.ts',
      ],
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // Thresholds reflect current reality across the API source tree,
      // including a pre-existing service-layer coverage gap in
      // webhook-service.ts and a few helpers (queries.ts, pagination.ts,
      // signature.ts) that are partially-stubbed.  Acts as a regression
      // detector — DO NOT lower without good reason.
      thresholds: { lines: 35, functions: 30, branches: 60, statements: 35 },
      exclude: [
        'tests/**',
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/workers/**',
        'dist/**',
        '**/*.config.ts',
      ],
    },
  },
});

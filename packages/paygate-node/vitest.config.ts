import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      exclude: ['test/**', 'src/cli/**', 'src/**/*.d.ts'],
    },
  },
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'workers/webhook-worker': 'src/workers/webhook-worker.ts',
    'workers/audit-shipper': 'src/workers/audit-shipper.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  minify: false,
  treeshake: true,
  outDir: 'dist',
  banner: () => ({
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  }),
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
    'middleware/express': 'src/middleware/express.ts',
    'middleware/fastify': 'src/middleware/fastify.ts',
    'middleware/hono': 'src/middleware/hono.ts',
    'middleware/next': 'src/middleware/next.ts',
  },
  format: ['esm', 'cjs'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  minify: false,
  treeshake: true,
  outDir: 'dist',
  banner: ({ format }) =>
    format === 'esm' ? { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } : {},
});

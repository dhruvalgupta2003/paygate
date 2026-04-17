import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.PAYGATE_DATABASE_URL ?? 'postgresql://paygate:paygate@localhost:5432/paygate',
  },
  strict: true,
  verbose: true,
} satisfies Config;

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.LIMEN_DATABASE_URL ?? 'postgresql://limen:limen@localhost:5432/limen',
  },
  strict: true,
  verbose: true,
} satisfies Config;

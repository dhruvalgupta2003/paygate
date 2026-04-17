import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { getEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import * as schema from './schema.js';

/**
 * Singleton Drizzle + postgres-js pool.  All database access goes through
 * `getDb()` — never import a hardcoded client in routes/services.
 */

export type Database = PostgresJsDatabase<typeof schema>;

interface DbHandles {
  readonly db: Database;
  readonly sql: Sql;
}

let handles: DbHandles | undefined;

export function getDb(): Database {
  return getHandles().db;
}

export function getSql(): Sql {
  return getHandles().sql;
}

function getHandles(): DbHandles {
  if (handles !== undefined) return handles;
  const env = getEnv();
  const logger = getLogger();
  const client = postgres(env.PAYGATE_DATABASE_URL, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: (n) => logger.debug({ notice: n }, 'pg notice'),
  });
  const db = drizzle(client, { schema });
  handles = { db, sql: client };
  return handles;
}

export async function closeDb(): Promise<void> {
  if (handles === undefined) return;
  await handles.sql.end({ timeout: 5 });
  handles = undefined;
}

export { schema };

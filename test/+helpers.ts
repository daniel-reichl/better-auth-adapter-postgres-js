import postgres from 'postgres'

/**
 * Creates a Postgres.js client for a test file.
 *
 * @param options - Extra client options, e.g. `{ prepare: false }` when tables are recreated mid-run.
 * @returns A client with up to 5 connections, which the caller must close.
 */
export function createTestSql(options: { prepare?: boolean } = {}) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return postgres(url, { max: 5, ...options })
}

type TestSql = ReturnType<typeof createTestSql>

/**
 * Creates an empty schema, dropping any existing one first so state left by a
 * failed run cannot leak into the current run.
 *
 * @param sql - Client created by {@link createTestSql}.
 * @param name - Schema name; interpolated into DDL, so it must be a trusted constant.
 */
export async function createTestSchema(sql: TestSql, name: string): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
  await sql.unsafe(`CREATE SCHEMA "${name}"`)
}

/**
 * Drops the schema with all its contents and closes the client.
 *
 * @param sql - Client created by {@link createTestSql}; unusable afterwards.
 * @param name - Schema name; interpolated into DDL, so it must be a trusted constant.
 */
export async function dropTestSchema(sql: TestSql, name: string): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
  await sql.end()
}

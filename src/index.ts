import type { Sql } from 'postgres'

import { createPostgresJsAdapter, createPostgresJsCustomAdapter } from './adapter.ts'
import type { PostgresJsAdapterFactory, PostgresJsAdapterOptions } from './types.ts'

/**
 * Creates a Better Auth database adapter backed by Postgres.js.
 *
 * Provides completely schema-agnostic, configurable model and field mapping,
 * parameterized query construction with SQL injection safety, operator support,
 * and optional transactional execution.
 *
 * @param sql - Active Postgres.js client or transaction.
 * @param options - Adapter configuration options (schema, modelMap, fieldMap, casing).
 * @returns An AdapterFactory ready for Better Auth initialization.
 */
export function postgresJsAdapter(
  sql: Sql,
  options: PostgresJsAdapterOptions = {},
): PostgresJsAdapterFactory {
  return createPostgresJsAdapter(sql, options)
}

export type {
  CasingStrategy,
  PostgresJsAdapterFactory,
  PostgresJsAdapterOptions,
} from './types.ts'
export { createPostgresJsAdapter, createPostgresJsCustomAdapter }

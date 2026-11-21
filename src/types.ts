import type { BetterAuthOptions } from 'better-auth'
import type { AdapterFactory } from 'better-auth/adapters'

/**
 * Casing translation strategy for unmapped database fields and tables.
 */
export type CasingStrategy = 'snake_case' | 'preserve'

/**
 * Configuration options for the Postgres.js Better Auth adapter.
 */
export interface PostgresJsAdapterOptions {
  /** Optional schema name in PostgreSQL (defaults to current search_path or 'public'). */
  schema?: string
  /** Optional model-to-table overrides (e.g. { user: 'users', session: 'user_sessions' }). */
  modelMap?: Record<string, string>
  /** Optional field-to-column overrides per model (e.g. { user: { displayName: 'name' } }). */
  fieldMap?: Record<string, Record<string, string>>
  /** Strategy for translating unmapped field names, e.g. 'snake_case' | 'preserve'. Defaults to 'preserve'. */
  casing?: CasingStrategy
  /** Optional flag to use plural table names if no explicit model mapping is provided. */
  usePlural?: boolean
  /** Enable debug logging for adapter database queries and operations. */
  debugLogs?: boolean
}

/**
 * Represents a resolved PostgreSQL table identifier with optional schema qualification.
 */
export interface ResolvedTableIdentifier {
  /** Optional PostgreSQL schema name qualifying the table. */
  schema?: string
  /** Target database table name. */
  table: string
}

/**
 * Public factory function type returned by postgresJsAdapter.
 */
export type PostgresJsAdapterFactory = AdapterFactory<BetterAuthOptions>

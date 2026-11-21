import type { CleanedWhere } from 'better-auth/adapters'
import type { PendingQuery, Row, Sql } from 'postgres'

import type { ResolvedTableIdentifier } from './types.ts'

/**
 * Type of SQL query fragment returned by postgres.js tagged templates.
 */
export type SqlFragment = PendingQuery<Row[]>

/**
 * Column resolution callback used to translate application fields to database columns.
 */
export type ColumnResolver = (field: string) => string

/**
 * Builds a schema-qualified or standalone table reference identifier fragment.
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param table - Resolved table identifier with optional schema.
 * @returns Parameterized SQL fragment for the table identifier.
 */
export function buildTableRef(sql: Sql, table: ResolvedTableIdentifier): SqlFragment {
  if (table.schema) {
    return sql`${sql(table.schema)}.${sql(table.table)}`
  }
  return sql`${sql(table.table)}`
}

/**
 * Builds a single SQL condition fragment for a Better Auth query filter.
 *
 * Safely translates operators (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`,
 * `not_in`, `contains`, `starts_with`, `ends_with`) with NULL-safety and
 * empty-array safeguards.
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param condition - Normalized Better Auth condition to build.
 * @param resolveColumn - Callback resolving model field name to database column name.
 * @returns Parameterized condition fragment.
 */
export function buildCondition(
  sql: Sql,
  condition: CleanedWhere,
  resolveColumn: ColumnResolver,
): SqlFragment {
  const column = resolveColumn(condition.field)
  const op = (condition.operator || 'eq').toLowerCase()
  const val = condition.value
  const isInsensitive = condition.mode === 'insensitive'

  switch (op) {
    case 'eq': {
      if (val === null) {
        return sql`${sql(column)} IS NULL`
      }
      if (isInsensitive && typeof val === 'string') {
        return sql`LOWER(${sql(column)}) = LOWER(${val})`
      }
      return sql`${sql(column)} = ${val}`
    }

    case 'ne': {
      if (val === null) {
        return sql`${sql(column)} IS NOT NULL`
      }
      if (isInsensitive && typeof val === 'string') {
        return sql`LOWER(${sql(column)}) != LOWER(${val})`
      }
      return sql`${sql(column)} != ${val}`
    }

    case 'lt': {
      return sql`${sql(column)} < ${val}`
    }

    case 'lte': {
      return sql`${sql(column)} <= ${val}`
    }

    case 'gt': {
      return sql`${sql(column)} > ${val}`
    }

    case 'gte': {
      return sql`${sql(column)} >= ${val}`
    }

    case 'in': {
      if (Array.isArray(val)) {
        if (val.length === 0) {
          return sql`1 = 0`
        }
        if (isInsensitive && val.every((v) => typeof v === 'string')) {
          const lowerValues = val.map((v) => (v as string).toLowerCase())
          return sql`LOWER(${sql(column)}) = ANY(${lowerValues})`
        }
        return sql`${sql(column)} = ANY(${val})`
      }
      if (isInsensitive && typeof val === 'string') {
        return sql`LOWER(${sql(column)}) = LOWER(${val})`
      }
      return sql`${sql(column)} = ${val}`
    }

    case 'not_in': {
      if (Array.isArray(val)) {
        if (val.length === 0) {
          return sql`1 = 1`
        }
        if (isInsensitive && val.every((v) => typeof v === 'string')) {
          const lowerValues = val.map((v) => (v as string).toLowerCase())
          return sql`LOWER(${sql(column)}) != ALL(${lowerValues})`
        }
        return sql`${sql(column)} != ALL(${val})`
      }
      if (isInsensitive && typeof val === 'string') {
        return sql`LOWER(${sql(column)}) != LOWER(${val})`
      }
      return sql`${sql(column)} != ${val}`
    }

    case 'contains': {
      const pattern = `%${String(val)}%`
      if (isInsensitive) {
        return sql`${sql(column)} ILIKE ${pattern}`
      }
      return sql`${sql(column)} LIKE ${pattern}`
    }

    case 'starts_with': {
      const pattern = `${String(val)}%`
      if (isInsensitive) {
        return sql`${sql(column)} ILIKE ${pattern}`
      }
      return sql`${sql(column)} LIKE ${pattern}`
    }

    case 'ends_with': {
      const pattern = `%${String(val)}`
      if (isInsensitive) {
        return sql`${sql(column)} ILIKE ${pattern}`
      }
      return sql`${sql(column)} LIKE ${pattern}`
    }

    default: {
      return sql`${sql(column)} = ${val}`
    }
  }
}

/**
 * Combines an array of SQL fragments with a given logical connector (AND or OR).
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param fragments - Condition fragments to join.
 * @param connector - Logical operator used to join fragments.
 * @returns Combined SQL fragment or null if array is empty.
 */
export function combineFragments(
  sql: Sql,
  fragments: SqlFragment[],
  connector: 'AND' | 'OR',
): SqlFragment | null {
  if (fragments.length === 0) {
    return null
  }
  let combined = fragments[0]
  for (let i = 1; i < fragments.length; i++) {
    const next = fragments[i]
    combined =
      connector === 'AND' ? sql`${combined} AND ${next}` : sql`${combined} OR ${next}`
  }
  return combined
}

/**
 * Builds the complete WHERE clause for a Better Auth query filter.
 *
 * Partitions conditions into AND and OR groups based on condition connector,
 * wrapping nested groups when both connectors are present.
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param where - Array of cleaned where conditions.
 * @param resolveColumn - Callback resolving model field name to database column name.
 * @returns Parameterized WHERE clause fragment or null if no conditions exist.
 */
export function buildWhereClause(
  sql: Sql,
  where: CleanedWhere[] | undefined,
  resolveColumn: ColumnResolver,
): SqlFragment | null {
  if (!where || where.length === 0) {
    return null
  }

  const andFragments: SqlFragment[] = []
  const orFragments: SqlFragment[] = []

  for (const condition of where) {
    const fragment = buildCondition(sql, condition, resolveColumn)
    if (condition.connector === 'OR') {
      orFragments.push(fragment)
    } else {
      andFragments.push(fragment)
    }
  }

  const andGroup = combineFragments(sql, andFragments, 'AND')
  const orGroup = combineFragments(sql, orFragments, 'OR')

  if (andGroup && orGroup) {
    return sql`(${andGroup}) AND (${orGroup})`
  }
  if (andGroup) {
    return andGroup
  }
  if (orGroup) {
    return orGroup
  }
  return null
}

/**
 * Sort specification accepted by Better Auth queries.
 */
export interface SortSpecification {
  /** Model field name to sort on. */
  field: string
  /** Sort direction ('asc' or 'desc'). */
  direction: 'asc' | 'desc'
}

/**
 * Builds an ORDER BY clause for a Better Auth query.
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param sortBy - Sort specification.
 * @param resolveColumn - Callback resolving model field name to database column name.
 * @returns Parameterized ORDER BY fragment or null if sortBy is omitted.
 */
export function buildOrderByClause(
  sql: Sql,
  sortBy: SortSpecification | undefined,
  resolveColumn: ColumnResolver,
): SqlFragment | null {
  if (!sortBy?.field) {
    return null
  }
  const column = resolveColumn(sortBy.field)
  const direction = sortBy.direction.toLowerCase() === 'desc' ? sql`DESC` : sql`ASC`
  return sql`ORDER BY ${sql(column)} ${direction}`
}

/**
 * Builds a pagination clause (LIMIT and OFFSET) for a Better Auth query.
 *
 * @param sql - Active Postgres.js connection or transaction.
 * @param limit - Optional maximum number of rows to return.
 * @param offset - Optional number of rows to skip.
 * @returns Parameterized LIMIT/OFFSET fragment or null if both are omitted.
 */
export function buildPaginationClause(
  sql: Sql,
  limit?: number,
  offset?: number,
): SqlFragment | null {
  const hasLimit = typeof limit === 'number' && limit >= 0
  const hasOffset = typeof offset === 'number' && offset >= 0

  if (hasLimit && hasOffset) {
    return sql`LIMIT ${limit} OFFSET ${offset}`
  }
  if (hasLimit) {
    return sql`LIMIT ${limit}`
  }
  if (hasOffset) {
    return sql`OFFSET ${offset}`
  }
  return null
}

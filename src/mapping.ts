import type { PostgresJsAdapterOptions, ResolvedTableIdentifier } from './types.ts'

/**
 * Converts a camelCase or mixed-case identifier string into snake_case.
 *
 * @param value - Identifier to convert.
 * @returns Converted snake_case string.
 */
export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * Converts a snake_case identifier string into camelCase.
 *
 * @param value - Identifier to convert.
 * @returns Converted camelCase string.
 */
export function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Pluralizes a word for standard table naming conventions.
 *
 * @param value - Word to pluralize.
 * @returns Pluralized form of the word.
 */
export function pluralize(value: string): string {
  if (
    value.endsWith('s') ||
    value.endsWith('x') ||
    value.endsWith('z') ||
    value.endsWith('ch') ||
    value.endsWith('sh')
  ) {
    return `${value}es`
  }
  if (value.endsWith('y') && !/[aeiou]y$/i.test(value)) {
    return `${value.slice(0, -1)}ies`
  }
  return `${value}s`
}

/**
 * Target model reference provided by Better Auth operations.
 */
export interface ModelTargetIdentifier {
  /** Physical model or table name used by Better Auth. */
  model: string
  /** Canonical Better Auth model key (e.g. 'user', 'session'). */
  modelKey?: string
}

/**
 * Resolves a Better Auth model name to its target PostgreSQL table and schema.
 *
 * Checks explicit model overrides in {@link PostgresJsAdapterOptions.modelMap}
 * first, falling back to pluralization and casing rules.
 *
 * @param target - The model target reference.
 * @param options - Adapter configuration options.
 * @returns Resolved table name and optional schema qualification.
 */
export function resolveTableName(
  target: ModelTargetIdentifier,
  options: PostgresJsAdapterOptions = {},
): ResolvedTableIdentifier {
  const explicitTable =
    (target.modelKey && options.modelMap?.[target.modelKey]) ||
    options.modelMap?.[target.model]

  let resolved = explicitTable
  if (!resolved) {
    const baseName = target.modelKey || target.model
    const pluralName = options.usePlural ? pluralize(baseName) : baseName
    resolved = options.casing === 'snake_case' ? toSnakeCase(pluralName) : pluralName
  }

  if (resolved.includes('.')) {
    const [schemaPart, tablePart] = resolved.split('.', 2)
    return {
      schema: schemaPart,
      table: tablePart,
    }
  }

  return {
    schema: options.schema,
    table: resolved,
  }
}

/**
 * Resolves an application model field name to its corresponding database column name.
 *
 * Checks explicit field overrides in {@link PostgresJsAdapterOptions.fieldMap}
 * first, falling back to casing strategy rules.
 *
 * @param model - Model name or table key.
 * @param field - Model field name.
 * @param options - Adapter configuration options.
 * @param modelKey - Optional canonical Better Auth model key.
 * @returns Resolved column name in the database.
 */
export function resolveColumnName(
  model: string,
  field: string,
  options: PostgresJsAdapterOptions = {},
  modelKey?: string,
): string {
  if (modelKey && options.fieldMap?.[modelKey]?.[field]) {
    return options.fieldMap[modelKey][field]
  }
  if (options.fieldMap?.[model]?.[field]) {
    return options.fieldMap[model][field]
  }
  if (options.casing === 'snake_case') {
    return toSnakeCase(field)
  }
  return field
}

/**
 * Resolves a database column name back to its corresponding application model field name.
 *
 * Inverts explicit field overrides from {@link PostgresJsAdapterOptions.fieldMap}
 * first, falling back to casing translation.
 *
 * @param model - Model name or table key.
 * @param column - Database column name.
 * @param options - Adapter configuration options.
 * @param modelKey - Optional canonical Better Auth model key.
 * @returns Resolved model field name.
 */
export function resolveFieldName(
  model: string,
  column: string,
  options: PostgresJsAdapterOptions = {},
  modelKey?: string,
): string {
  const modelKeyFields = modelKey ? options.fieldMap?.[modelKey] : undefined
  if (modelKeyFields) {
    for (const [field, col] of Object.entries(modelKeyFields)) {
      if (col === column) {
        return field
      }
    }
  }

  const modelFields = options.fieldMap?.[model]
  if (modelFields) {
    for (const [field, col] of Object.entries(modelFields)) {
      if (col === column) {
        return field
      }
    }
  }

  if (options.casing === 'snake_case') {
    return toCamelCase(column)
  }
  return column
}

/**
 * Maps a model record whose keys are application field names into an object whose keys
 * are database column names.
 *
 * @param record - Data record to map.
 * @param model - Model name.
 * @param options - Adapter configuration options.
 * @param modelKey - Optional canonical Better Auth model key.
 * @returns Record with translated column keys.
 */
export function mapRecordToColumns<T extends Record<string, unknown>>(
  record: T,
  model: string,
  options: PostgresJsAdapterOptions = {},
  modelKey?: string,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(record)) {
    const column = resolveColumnName(model, field, options, modelKey)
    mapped[column] = value
  }
  return mapped
}

/**
 * Maps a database row whose keys are column names into an application object whose keys
 * are model field names.
 *
 * @param row - Database row to map.
 * @param model - Model name.
 * @param options - Adapter configuration options.
 * @param modelKey - Optional canonical Better Auth model key.
 * @returns Record with translated field keys.
 */
export function mapRowToFields<T = Record<string, unknown>>(
  row: Record<string, unknown>,
  model: string,
  options: PostgresJsAdapterOptions = {},
  modelKey?: string,
): T {
  const mapped: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(row)) {
    const field = resolveFieldName(model, column, options, modelKey)
    mapped[field] = value
  }
  return mapped as T
}

import type { BetterAuthOptions } from 'better-auth'
import type {
  CleanedWhere,
  CustomAdapter,
  DBAdapterSchemaCreation,
  DBTransactionAdapter,
  ModelTarget,
} from 'better-auth/adapters'
import { createAdapterFactory } from 'better-auth/adapters'
import type { Sql } from 'postgres'

import type { SqlFragment } from './builder.ts'
import {
  buildOrderByClause,
  buildPaginationClause,
  buildTableRef,
  buildWhereClause,
} from './builder.ts'
import {
  mapRecordToColumns,
  mapRowToFields,
  resolveColumnName,
  resolveTableName,
} from './mapping.ts'
import type { PostgresJsAdapterFactory, PostgresJsAdapterOptions } from './types.ts'

/**
 * Creates a raw Better Auth CustomAdapter instance backed by Postgres.js.
 *
 * @param sql - Active Postgres.js client or transaction connection.
 * @param options - Adapter configuration options.
 * @param authOptions - Better Auth options, used to generate schema ids.
 * @param getFieldName - Maps default field names to configured ones for `select` lists.
 * @returns CustomAdapter implementation.
 */
export function createPostgresJsCustomAdapter(
  sql: Sql,
  options: PostgresJsAdapterOptions = {},
  authOptions?: BetterAuthOptions,
  getFieldName?: (args: { model: string; field: string }) => string,
): CustomAdapter {
  const resolveSelectColumn = (
    model: string,
    field: string,
    modelKey?: string,
  ): string =>
    resolveColumnName(
      model,
      getFieldName?.({ model, field }) ?? field,
      options,
      modelKey,
    )

  return {
    create: async <T extends Record<string, unknown>>({
      data,
      model,
      modelKey,
      select,
    }: ModelTarget & {
      data: T
      select?: string[] | undefined
    }): Promise<T> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const dbData = mapRecordToColumns(data, model, options, modelKey)
      const keys = Object.keys(dbData)

      let selectFragment: SqlFragment = sql`*`
      if (select && select.length > 0) {
        const columns = select.map((field) =>
          resolveSelectColumn(model, field, modelKey),
        )
        selectFragment = sql`${sql(columns)}`
      }

      let rows: Record<string, unknown>[]
      if (keys.length === 0) {
        rows = await sql`
          INSERT INTO ${tableRef} DEFAULT VALUES
          RETURNING ${selectFragment}
        `
      } else {
        rows = await sql`
          INSERT INTO ${tableRef} ${sql(dbData)}
          RETURNING ${selectFragment}
        `
      }

      return mapRowToFields<T>(rows[0], model, options, modelKey)
    },

    findOne: async <T>({
      model,
      modelKey,
      where,
      select,
    }: ModelTarget & {
      where: CleanedWhere[]
      select?: string[] | undefined
    }): Promise<T | null> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)

      let selectFragment: SqlFragment = sql`*`
      if (select && select.length > 0) {
        const columns = select.map((field) =>
          resolveSelectColumn(model, field, modelKey),
        )
        selectFragment = sql`${sql(columns)}`
      }

      const rows: Record<string, unknown>[] = whereClause
        ? await sql`
            SELECT ${selectFragment}
            FROM ${tableRef}
            WHERE ${whereClause}
            LIMIT 1
          `
        : await sql`
            SELECT ${selectFragment}
            FROM ${tableRef}
            LIMIT 1
          `

      if (!rows || rows.length === 0) {
        return null
      }

      return mapRowToFields<T>(rows[0], model, options, modelKey)
    },

    findMany: async <T>({
      model,
      modelKey,
      where,
      limit,
      select,
      sortBy,
      offset,
    }: ModelTarget & {
      where?: CleanedWhere[] | undefined
      limit?: number | undefined
      select?: string[] | undefined
      sortBy?:
        | {
            field: string
            direction: 'asc' | 'desc'
          }
        | undefined
      offset?: number | undefined
    }): Promise<T[]> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      const orderClause = buildOrderByClause(sql, sortBy, resolveCol)
      const paginationClause = buildPaginationClause(sql, limit, offset)

      let selectFragment: SqlFragment = sql`*`
      if (select && select.length > 0) {
        const columns = select.map((field) =>
          resolveSelectColumn(model, field, modelKey),
        )
        selectFragment = sql`${sql(columns)}`
      }

      const rows: Record<string, unknown>[] = await sql`
        SELECT ${selectFragment}
        FROM ${tableRef}
        ${whereClause ? sql`WHERE ${whereClause}` : sql``}
        ${orderClause ? orderClause : sql``}
        ${paginationClause ? paginationClause : sql``}
      `

      return rows.map((row) => mapRowToFields<T>(row, model, options, modelKey))
    },

    update: async <T>({
      model,
      modelKey,
      where,
      update: values,
    }: ModelTarget & {
      where: CleanedWhere[]
      update: T
    }): Promise<T | null> => {
      if (!where || where.length === 0) {
        return null
      }

      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const dbData = mapRecordToColumns(
        values as Record<string, unknown>,
        model,
        options,
        modelKey,
      )
      if (Object.keys(dbData).length === 0) {
        return null
      }

      const whereClause = buildWhereClause(sql, where, resolveCol)
      if (!whereClause) {
        return null
      }

      const rows: Record<string, unknown>[] = await sql`
        UPDATE ${tableRef}
        SET ${sql(dbData)}
        WHERE ${whereClause}
        RETURNING *
      `

      if (!rows || rows.length === 0) {
        return null
      }

      return mapRowToFields<T>(rows[0], model, options, modelKey)
    },

    updateMany: async ({
      model,
      modelKey,
      where,
      update: values,
    }: ModelTarget & {
      where: CleanedWhere[]
      update: Record<string, unknown>
    }): Promise<number> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const dbData = mapRecordToColumns(values, model, options, modelKey)
      if (Object.keys(dbData).length === 0) {
        return 0
      }

      const whereClause = buildWhereClause(sql, where, resolveCol)
      const result = whereClause
        ? await sql`UPDATE ${tableRef} SET ${sql(dbData)} WHERE ${whereClause}`
        : await sql`UPDATE ${tableRef} SET ${sql(dbData)}`

      return result.count
    },

    delete: async ({
      model,
      modelKey,
      where,
    }: ModelTarget & {
      where: CleanedWhere[]
    }): Promise<void> => {
      if (!where || where.length === 0) {
        return
      }

      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      if (!whereClause) {
        return
      }

      await sql`DELETE FROM ${tableRef} WHERE ${whereClause}`
    },

    deleteMany: async ({
      model,
      modelKey,
      where,
    }: ModelTarget & {
      where: CleanedWhere[]
    }): Promise<number> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      const result = whereClause
        ? await sql`DELETE FROM ${tableRef} WHERE ${whereClause}`
        : await sql`DELETE FROM ${tableRef}`

      return result.count
    },

    consumeOne: async <T>({
      model,
      modelKey,
      where,
    }: ModelTarget & {
      where: CleanedWhere[]
    }): Promise<T | null> => {
      if (!where || where.length === 0) {
        return null
      }

      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      if (!whereClause) {
        return null
      }

      // Keyed by id (not ctid) so a concurrent update during the row lock still matches.
      const idCol = resolveCol('id')

      const rows: Record<string, unknown>[] = await sql`
        DELETE FROM ${tableRef}
        WHERE ${sql(idCol)} IN (
          SELECT ${sql(idCol)} FROM ${tableRef}
          WHERE ${whereClause}
          LIMIT 1
          FOR UPDATE
        )
        RETURNING *
      `

      if (!rows || rows.length === 0) {
        return null
      }

      return mapRowToFields<T>(rows[0], model, options, modelKey)
    },

    incrementOne: async <T>({
      model,
      modelKey,
      where,
      increment,
      set,
    }: ModelTarget & {
      where: CleanedWhere[]
      increment: Record<string, number>
      set?: Record<string, unknown> | undefined
    }): Promise<T | null> => {
      if (!where || where.length === 0) {
        return null
      }

      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      if (!whereClause) {
        return null
      }

      // Keyed by id (not ctid) so a concurrent update during the row lock still matches.
      const idCol = resolveCol('id')

      const setFragments: SqlFragment[] = []
      for (const [field, delta] of Object.entries(increment)) {
        const col = resolveCol(field)
        setFragments.push(sql`${sql(col)} = ${sql(col)} + ${delta}`)
      }
      if (set) {
        for (const [field, val] of Object.entries(set)) {
          const col = resolveCol(field)
          setFragments.push(
            sql`${sql(col)} = ${val as string | number | boolean | Date | null}`,
          )
        }
      }

      if (setFragments.length === 0) {
        return null
      }

      let combinedSet = setFragments[0]
      for (let i = 1; i < setFragments.length; i++) {
        combinedSet = sql`${combinedSet}, ${setFragments[i]}`
      }

      const rows: Record<string, unknown>[] = await sql`
        UPDATE ${tableRef}
        SET ${combinedSet}
        WHERE ${sql(idCol)} IN (
          SELECT ${sql(idCol)} FROM ${tableRef}
          WHERE ${whereClause}
          LIMIT 1
          FOR UPDATE
        )
        RETURNING *
      `

      if (!rows || rows.length === 0) {
        return null
      }

      return mapRowToFields<T>(rows[0], model, options, modelKey)
    },

    count: async ({
      model,
      modelKey,
      where,
    }: ModelTarget & {
      where?: CleanedWhere[] | undefined
    }): Promise<number> => {
      const table = resolveTableName({ model, modelKey }, options)
      const tableRef = buildTableRef(sql, table)
      const resolveCol = (field: string): string =>
        resolveColumnName(model, field, options, modelKey)

      const whereClause = buildWhereClause(sql, where, resolveCol)
      const rows: { count: number | string }[] = whereClause
        ? await sql`SELECT COUNT(*)::int AS count FROM ${tableRef} WHERE ${whereClause}`
        : await sql`SELECT COUNT(*)::int AS count FROM ${tableRef}`

      return Number(rows[0]?.count ?? 0)
    },

    createSchema: async ({
      tables,
      file,
    }: Parameters<
      NonNullable<CustomAdapter['createSchema']>
    >[0]): Promise<DBAdapterSchemaCreation> => {
      const statements: string[] = []

      // Ids generated by the database must be backed by a matching column type and default.
      const generateId = authOptions?.advanced?.database?.generateId
      let idColumnType = 'TEXT'
      let idRefType = 'TEXT'
      let idDefault = ''
      if (generateId === 'uuid') {
        idColumnType = 'UUID'
        idRefType = 'UUID'
        idDefault = ' DEFAULT gen_random_uuid()'
      } else if (generateId === 'serial') {
        idColumnType = 'SERIAL'
        idRefType = 'INTEGER'
      }

      for (const [modelName, modelDef] of Object.entries(tables)) {
        const table = resolveTableName(
          { model: modelDef.modelName, modelKey: modelName },
          options,
        )
        const tableRefStr = table.schema
          ? `"${table.schema}"."${table.table}"`
          : `"${table.table}"`

        const colDefs: string[] = []
        // Better Auth's table definitions omit the implicit id field.
        if (!('id' in modelDef.fields)) {
          colDefs.push(
            `"${resolveColumnName(modelName, 'id', options)}" ${idColumnType} PRIMARY KEY${idDefault}`,
          )
        }
        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
          const colName = resolveColumnName(
            modelName,
            fieldDef.fieldName ?? fieldName,
            options,
          )
          let colType = 'TEXT'

          switch (fieldDef.type) {
            case 'number':
              colType = fieldDef.bigint ? 'BIGINT' : 'INTEGER'
              break
            case 'string[]':
              colType = 'TEXT[]'
              break
            case 'number[]':
              colType = 'INTEGER[]'
              break
            case 'boolean':
              colType = 'BOOLEAN'
              break
            case 'date':
              colType = 'TIMESTAMPTZ'
              break
            case 'json':
              colType = 'JSONB'
              break
            default:
              colType = 'TEXT'
          }

          if (fieldName === 'id') {
            colDefs.push(`"${colName}" ${idColumnType} PRIMARY KEY${idDefault}`)
          } else {
            if (fieldDef.references?.field === 'id') {
              colType = idRefType
            }
            const constraints: string[] = []
            if (fieldDef.required) {
              constraints.push('NOT NULL')
            }
            if (fieldDef.unique) {
              constraints.push('UNIQUE')
            }
            if (fieldDef.references) {
              const ref = fieldDef.references
              const refKey =
                Object.keys(tables).find(
                  (key) => key === ref.model || tables[key]?.modelName === ref.model,
                ) ?? ref.model
              const refTable = resolveTableName(
                { model: tables[refKey]?.modelName ?? ref.model, modelKey: refKey },
                options,
              )
              const refTableStr = refTable.schema
                ? `"${refTable.schema}"."${refTable.table}"`
                : `"${refTable.table}"`
              const refCol = resolveColumnName(
                refKey,
                tables[refKey]?.fields[ref.field]?.fieldName ?? ref.field,
                options,
              )
              const onDelete = (ref.onDelete ?? 'cascade').toUpperCase()
              constraints.push(
                `REFERENCES ${refTableStr}("${refCol}") ON DELETE ${onDelete}`,
              )
            }
            colDefs.push(
              `"${colName}" ${colType}${constraints.length > 0 ? ` ${constraints.join(' ')}` : ''}`,
            )
          }
        }

        statements.push(
          `CREATE TABLE IF NOT EXISTS ${tableRefStr} (\n  ${colDefs.join(',\n  ')}\n);`,
        )
      }

      return {
        code: statements.join('\n\n'),
        path: file || 'schema.sql',
      }
    },
  }
}

/**
 * Creates a Better Auth AdapterFactory for Postgres.js.
 *
 * @param sql - Active Postgres.js client or transaction.
 * @param options - Adapter configuration options.
 * @returns An AdapterFactory ready for Better Auth initialization.
 */
export function createPostgresJsAdapter(
  sql: Sql,
  options: PostgresJsAdapterOptions = {},
): PostgresJsAdapterFactory {
  let lazyOptions: BetterAuthOptions | null = null

  const factory = createAdapterFactory({
    adapter: ({ options: authOptions, getFieldName }) =>
      createPostgresJsCustomAdapter(sql, options, authOptions, getFieldName),
    config: {
      adapterId: 'postgres-js',
      adapterName: 'PostgreSQL (postgres.js)',
      supportsNumericIds: true,
      supportsUUIDs: true,
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsArrays: true,
      usePlural: options.usePlural ?? false,
      debugLogs: options.debugLogs ?? false,
      // postgres.js needs sql.json() to serialize objects bound to JSONB columns.
      customTransformInput: ({ data, fieldAttributes }) =>
        fieldAttributes.type === 'json' &&
        data !== null &&
        typeof data === 'object' &&
        !(data instanceof Date)
          ? sql.json(data as never)
          : data,
      // BIGINT columns come back from postgres.js as strings.
      customTransformOutput: ({ data, field, fieldAttributes }) =>
        fieldAttributes.type === 'number' &&
        typeof data === 'string' &&
        field !== 'id' &&
        fieldAttributes.references?.field !== 'id'
          ? Number(data)
          : data,
      transaction: async <R>(
        callback: (trx: DBTransactionAdapter) => Promise<R>,
      ): Promise<R> => {
        const result = await sql.begin(async (trxSql) => {
          const trxFactory = createPostgresJsAdapter(trxSql as unknown as Sql, options)
          return callback(
            trxFactory(
              (lazyOptions ?? {}) as BetterAuthOptions,
            ) as unknown as DBTransactionAdapter,
          )
        })
        return result as unknown as R
      },
    },
  })

  return ((authOptions?: BetterAuthOptions) => {
    lazyOptions = authOptions ?? null
    return factory((authOptions ?? {}) as BetterAuthOptions)
  }) as PostgresJsAdapterFactory
}

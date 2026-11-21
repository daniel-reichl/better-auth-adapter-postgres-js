import { betterAuth } from 'better-auth'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

import {
  createPostgresJsAdapter,
  createPostgresJsCustomAdapter,
  postgresJsAdapter,
} from './index.ts'

describe('adapter unit tests', () => {
  const sql = postgres({ max: 1 })

  afterAll(async () => {
    await sql.end()
  })

  it('exports postgresJsAdapter and createPostgresJsAdapter functions', () => {
    expect(typeof postgresJsAdapter).toBe('function')
    expect(typeof createPostgresJsAdapter).toBe('function')
  })

  it('creates an adapter factory that implements the DBAdapter interface', () => {
    const factory = postgresJsAdapter(sql, {
      casing: 'snake_case',
      modelMap: {
        user: 'users',
        session: 'user_sessions',
      },
    })

    const adapter = factory({})
    expect(typeof adapter.create).toBe('function')
    expect(typeof adapter.findOne).toBe('function')
    expect(typeof adapter.findMany).toBe('function')
    expect(typeof adapter.update).toBe('function')
    expect(typeof adapter.updateMany).toBe('function')
    expect(typeof adapter.delete).toBe('function')
    expect(typeof adapter.deleteMany).toBe('function')
    expect(typeof adapter.count).toBe('function')
    expect(typeof adapter.consumeOne).toBe('function')
    expect(typeof adapter.incrementOne).toBe('function')
    expect(typeof adapter.transaction).toBe('function')
    expect(typeof adapter.createSchema).toBe('function')
  })

  it('generates PostgreSQL DDL via createSchema', async () => {
    const custom = createPostgresJsCustomAdapter(sql, {
      schema: 'app_test',
      modelMap: {
        user: 'users',
      },
    })

    const schemaResult = await custom.createSchema?.({
      file: 'migrations/auth.sql',
      tables: {
        user: {
          modelName: 'user',
          fields: {
            id: { type: 'string', required: true },
            email: { type: 'string', required: true, unique: true },
            emailVerified: { type: 'boolean' },
            createdAt: { type: 'date' },
            metadata: { type: 'json' },
            loginCount: { type: 'number' },
          },
        },
      },
    })

    expect(schemaResult).toBeDefined()
    expect(schemaResult?.path).toBe('migrations/auth.sql')
    expect(schemaResult?.code).toContain('CREATE TABLE IF NOT EXISTS')
    expect(schemaResult?.code).toContain('"app_test"."users"')
    expect(schemaResult?.code).toContain('"email" TEXT NOT NULL UNIQUE')
    expect(schemaResult?.code).toContain('"emailVerified" BOOLEAN')
    expect(schemaResult?.code).toContain('"createdAt" TIMESTAMPTZ')
    expect(schemaResult?.code).toContain('"metadata" JSONB')
    expect(schemaResult?.code).toContain('"loginCount" INTEGER')
  })

  it('adds an id primary key and foreign keys in createSchema', async () => {
    const custom = createPostgresJsCustomAdapter(sql, { casing: 'snake_case' })

    const result = await custom.createSchema?.({
      tables: {
        user: {
          modelName: 'user',
          fields: { name: { type: 'string', required: true } },
        },
        session: {
          modelName: 'session',
          fields: {
            userId: {
              type: 'string',
              required: true,
              references: { model: 'user', field: 'id', onDelete: 'cascade' },
            },
          },
        },
      },
    })

    expect(result?.code).toContain('"id" TEXT PRIMARY KEY')
    expect(result?.code).toContain(
      '"user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE',
    )
  })

  const idTables = {
    user: { modelName: 'user', fields: { name: { type: 'string' as const } } },
    session: {
      modelName: 'session',
      fields: {
        userId: {
          type: 'string' as const,
          references: { model: 'user', field: 'id', onDelete: 'cascade' as const },
        },
      },
    },
  }

  it('creates a uuid id with a database default and matching foreign keys', async () => {
    const custom = createPostgresJsCustomAdapter(
      sql,
      {},
      {
        advanced: { database: { generateId: 'uuid' } },
      },
    )
    const result = await custom.createSchema?.({ tables: idTables })

    expect(result?.code).toContain('"id" UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(result?.code).toContain('"userId" UUID REFERENCES "user"("id")')
  })

  it('creates a serial id with matching foreign keys', async () => {
    const custom = createPostgresJsCustomAdapter(
      sql,
      {},
      {
        advanced: { database: { generateId: 'serial' } },
      },
    )
    const result = await custom.createSchema?.({ tables: idTables })

    expect(result?.code).toContain('"id" SERIAL PRIMARY KEY')
    expect(result?.code).toContain('"userId" INTEGER REFERENCES "user"("id")')
  })

  it('maps bigint numbers and array fields to matching column types', async () => {
    const custom = createPostgresJsCustomAdapter(sql)
    const result = await custom.createSchema?.({
      tables: {
        rateLimit: {
          modelName: 'rateLimit',
          fields: {
            lastRequest: { type: 'number', bigint: true },
            tags: { type: 'string[]' },
            scores: { type: 'number[]' },
          },
        },
      },
    })

    expect(result?.code).toContain('"lastRequest" BIGINT')
    expect(result?.code).toContain('"tags" TEXT[]')
    expect(result?.code).toContain('"scores" INTEGER[]')
  })

  it('initializes cleanly inside a Better Auth instance', () => {
    const adapter = postgresJsAdapter(sql, {
      casing: 'snake_case',
      modelMap: {
        user: 'users',
        session: 'user_sessions',
        account: 'user_provider_accounts',
        verification: 'user_verification',
      },
    })

    const auth = betterAuth({
      database: adapter,
      baseURL: 'http://localhost:3000',
      secret: '01234567890123456789012345678901',
    })

    expect(auth).toBeDefined()
    expect(auth.options.database).toBeDefined()
  })
})

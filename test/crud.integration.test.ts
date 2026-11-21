import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestSchema, createTestSql, dropTestSchema } from './+helpers.ts'
import { postgresJsAdapter } from '../src/index.ts'

describe('adapter integration tests', () => {
  const schemaName = 'adapter_integration_test'

  const sql = createTestSql()

  const adapterFactory = postgresJsAdapter(sql, {
    schema: schemaName,
    casing: 'snake_case',
    modelMap: {
      user: 'users',
      session: 'user_sessions',
      verification: 'user_verifications',
    },
  })

  const adapter = adapterFactory({
    user: {
      additionalFields: {
        score: { type: 'number' },
      },
    },
  })

  beforeAll(async () => {
    await createTestSchema(sql, schemaName)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
        "image" TEXT,
        "score" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_sessions" (
        "id" TEXT PRIMARY KEY,
        "token" TEXT NOT NULL UNIQUE,
        "user_id" TEXT NOT NULL REFERENCES "${schemaName}"."users"("id") ON DELETE CASCADE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "ip_address" TEXT,
        "user_agent" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_verifications" (
        "id" TEXT PRIMARY KEY,
        "identifier" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
  })

  afterAll(async () => {
    await dropTestSchema(sql, schemaName)
  })

  let aliceId = ''
  let bobId = ''
  let charlieId = ''

  it('creates and reads back a record with mapped camelCase fields', async () => {
    const created = await adapter.create<{
      id: string
      name: string
      email: string
      emailVerified: boolean
      score: number
      createdAt?: Date
      updatedAt?: Date
    }>({
      model: 'user',
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        emailVerified: true,
        score: 10,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    })

    expect(created.id).toBeDefined()
    aliceId = created.id
    expect(created.name).toBe('Alice')
    expect(created.email).toBe('alice@example.com')
    expect(created.emailVerified).toBe(true)

    // Verify row directly in postgres
    const raw =
      await sql`SELECT * FROM ${sql(schemaName)}.${sql('users')} WHERE id = ${aliceId}`
    expect(raw.length).toBe(1)
    expect(raw[0].email_verified).toBe(true)
    expect(raw[0].name).toBe('Alice')

    // Find record with adapter.findOne
    const found = await adapter.findOne<{
      id: string
      name: string
      email: string
      emailVerified: boolean
    }>({
      model: 'user',
      where: [
        {
          field: 'email',
          operator: 'eq',
          value: 'alice@example.com',
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })

    expect(found).not.toBeNull()
    expect(found?.id).toBe(aliceId)
    expect(found?.emailVerified).toBe(true)
  })

  it('returns null on findOne when no record matches', async () => {
    const found = await adapter.findOne({
      model: 'user',
      where: [
        {
          field: 'email',
          operator: 'eq',
          value: 'nonexistent@example.com',
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(found).toBeNull()
  })

  it('selects specific fields with select projection', async () => {
    const found = await adapter.findOne<{ id: string; email: string }>({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: aliceId,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
      select: ['id', 'email'],
    })

    expect(found).not.toBeNull()
    expect(found?.id).toBe(aliceId)
    expect(found?.email).toBe('alice@example.com')
  })

  it('updates a record matching where condition and returns updated row', async () => {
    const updated = await adapter.update<{
      id: string
      name: string
      emailVerified: boolean
    }>({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: aliceId,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
      update: {
        name: 'Alice Cooper',
        emailVerified: false,
      },
    })

    expect(updated).not.toBeNull()
    expect(updated?.name).toBe('Alice Cooper')
    expect(updated?.emailVerified).toBe(false)
  })

  it('finds records using findMany with filtering, sorting, and pagination', async () => {
    // Insert more records
    const bob = await adapter.create<{ id: string }>({
      model: 'user',
      data: {
        name: 'Bob',
        email: 'bob@example.com',
        emailVerified: true,
        score: 50,
      },
    })
    bobId = bob.id

    const charlie = await adapter.create<{ id: string }>({
      model: 'user',
      data: {
        name: 'Charlie',
        email: 'charlie@sample.org',
        emailVerified: false,
        score: 30,
      },
    })
    charlieId = charlie.id

    // Filter with contains
    const orgUsers = await adapter.findMany<{ id: string; email: string }>({
      model: 'user',
      where: [
        {
          field: 'email',
          operator: 'contains',
          value: 'sample.org',
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(orgUsers.length).toBe(1)
    expect(orgUsers[0].id).toBe(charlieId)

    // Filter with IN operator
    const inUsers = await adapter.findMany<{ id: string }>({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'in',
          value: [aliceId, bobId],
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
      sortBy: {
        field: 'name',
        direction: 'asc',
      },
    })
    expect(inUsers.length).toBe(2)
    expect(inUsers[0].id).toBe(aliceId) // Alice Cooper
    expect(inUsers[1].id).toBe(bobId) // Bob

    // Pagination
    const page = await adapter.findMany<{ id: string }>({
      model: 'user',
      limit: 1,
      offset: 1,
      sortBy: {
        field: 'score',
        direction: 'desc',
      },
    })
    expect(page.length).toBe(1)
    expect(page[0].id).toBe(charlieId) // score 30 (second after Bob 50)
  })

  it('handles empty array in IN clause safely without error', async () => {
    const emptyIn = await adapter.findMany({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'in',
          value: [],
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(emptyIn).toEqual([])
  })

  it('updates multiple rows with updateMany and returns count', async () => {
    const count = await adapter.updateMany({
      model: 'user',
      where: [
        {
          field: 'emailVerified',
          operator: 'eq',
          value: true,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
      update: {
        score: 99,
      },
    })

    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('increments counter atomically with incrementOne', async () => {
    const res = await adapter.incrementOne<{ id: string; score: number }>({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: charlieId,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
      increment: {
        score: 15,
      },
    })

    expect(res).not.toBeNull()
    expect(res?.score).toBe(45) // 30 + 15
  })

  it('consumes a single row atomically with consumeOne', async () => {
    const createdVer = await adapter.create<{ id: string }>({
      model: 'verification',
      data: {
        identifier: 'token-abc',
        value: '123456',
        expiresAt: new Date(Date.now() + 60000),
      },
    })

    const consumed = await adapter.consumeOne<{
      id: string
      identifier: string
    }>({
      model: 'verification',
      where: [
        {
          field: 'identifier',
          operator: 'eq',
          value: 'token-abc',
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })

    expect(consumed).not.toBeNull()
    expect(consumed?.id).toBe(createdVer.id)

    // Subsequent search must return null
    const after = await adapter.findOne({
      model: 'verification',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: createdVer.id,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(after).toBeNull()
  })

  it('counts matching rows with count', async () => {
    const total = await adapter.count({
      model: 'user',
    })
    expect(total).toBe(3)
  })

  it('deletes rows with delete and deleteMany', async () => {
    await adapter.delete({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: charlieId,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })

    const remaining = await adapter.count({ model: 'user' })
    expect(remaining).toBe(2)

    const deletedCount = await adapter.deleteMany({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'in',
          value: [aliceId, bobId],
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(deletedCount).toBe(2)
  })

  it('supports transactions with commit and rollback', async () => {
    let committedId = ''

    // 1. Successful transaction commit
    await adapter.transaction(async (trx) => {
      const u = await trx.create<{ id: string }>({
        model: 'user',
        data: {
          name: 'Committed User',
          email: 'committed@example.com',
          score: 100,
        },
      })
      committedId = u.id
    })

    const committed = await adapter.findOne({
      model: 'user',
      where: [
        {
          field: 'id',
          operator: 'eq',
          value: committedId,
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(committed).not.toBeNull()

    // 2. Rolled back transaction
    await expect(
      adapter.transaction(async (trx) => {
        await trx.create({
          model: 'user',
          data: {
            name: 'Rollback User',
            email: 'rollback@example.com',
            score: 200,
          },
        })
        throw new Error('Forced Rollback')
      }),
    ).rejects.toThrow('Forced Rollback')

    const rolledBack = await adapter.findOne({
      model: 'user',
      where: [
        {
          field: 'email',
          operator: 'eq',
          value: 'rollback@example.com',
          connector: 'AND',
          mode: 'sensitive',
        },
      ],
    })
    expect(rolledBack).toBeNull()
  })
})

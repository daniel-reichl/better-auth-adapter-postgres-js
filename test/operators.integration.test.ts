import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestSchema, createTestSql, dropTestSchema } from './+helpers.ts'
import { postgresJsAdapter } from '../src/index.ts'

const schemaName = 'adapter_operators_test'

const sql = createTestSql()

const adapter = postgresJsAdapter(sql, { schema: schemaName, casing: 'snake_case' })({
  user: { additionalFields: { score: { type: 'number' } } },
})

type Op =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'ends_with'

function cond(
  field: string,
  operator: Op,
  value: unknown,
  extra: { connector?: 'AND' | 'OR'; mode?: 'sensitive' | 'insensitive' } = {},
) {
  return {
    field,
    operator,
    value,
    connector: extra.connector ?? 'AND',
    mode: extra.mode ?? 'sensitive',
  } as never
}

async function names(where: unknown[], sortField = 'name'): Promise<string[]> {
  const rows = await adapter.findMany<{ name: string }>({
    model: 'user',
    where: where as never,
    sortBy: { field: sortField, direction: 'asc' },
  })
  return rows.map((r) => r.name)
}

describe('adapter operators against postgres', () => {
  beforeAll(async () => {
    await createTestSchema(sql, schemaName)
    await sql.unsafe(`
      CREATE TABLE "${schemaName}"."user" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
        "image" TEXT,
        "score" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const seed = [
      ['Alice', 'alice@Example.com', 10, '2026-01-01T00:00:00Z', null],
      ['Bob', 'bob@example.com', 20, '2026-02-01T00:00:00Z', 'bob.png'],
      ['Carol', 'carol@sample.org', 30, '2026-03-01T00:00:00Z', null],
      ['Dave', 'dave@sample.org', 40, '2026-04-01T00:00:00Z', 'dave.png'],
    ] as const
    for (const [name, email, score, createdAt, image] of seed) {
      await adapter.create({
        model: 'user',
        data: {
          name,
          email,
          score,
          image,
          emailVerified: false,
          createdAt: new Date(createdAt),
          updatedAt: new Date(createdAt),
        },
      })
    }
  })

  afterAll(async () => {
    await dropTestSchema(sql, schemaName)
  })

  it('supports comparison operators on numbers', async () => {
    expect(await names([cond('score', 'eq', 20)])).toEqual(['Bob'])
    expect(await names([cond('score', 'ne', 20)])).toEqual(['Alice', 'Carol', 'Dave'])
    expect(await names([cond('score', 'lt', 30)])).toEqual(['Alice', 'Bob'])
    expect(await names([cond('score', 'lte', 30)])).toEqual(['Alice', 'Bob', 'Carol'])
    expect(await names([cond('score', 'gt', 30)])).toEqual(['Dave'])
    expect(await names([cond('score', 'gte', 30)])).toEqual(['Carol', 'Dave'])
  })

  it('supports comparison operators on dates', async () => {
    // Falls between the seeded Feb 1 (Bob) and Mar 1 (Carol) rows.
    const cutoff = new Date('2026-02-15T00:00:00Z')
    expect(await names([cond('createdAt', 'lt', cutoff)])).toEqual(['Alice', 'Bob'])
    expect(await names([cond('createdAt', 'gte', cutoff)])).toEqual(['Carol', 'Dave'])
  })

  it('supports in and not_in', async () => {
    expect(await names([cond('name', 'in', ['Alice', 'Dave'])])).toEqual([
      'Alice',
      'Dave',
    ])
    expect(await names([cond('name', 'not_in', ['Alice', 'Dave'])])).toEqual([
      'Bob',
      'Carol',
    ])
    expect(await names([cond('name', 'not_in', [])])).toHaveLength(4)
  })

  it('supports string operators', async () => {
    expect(await names([cond('email', 'contains', 'sample')])).toEqual([
      'Carol',
      'Dave',
    ])
    expect(await names([cond('email', 'starts_with', 'bob')])).toEqual(['Bob'])
    expect(await names([cond('email', 'ends_with', '.org')])).toEqual(['Carol', 'Dave'])
  })

  it('honours case sensitivity modes', async () => {
    expect(await names([cond('email', 'eq', 'alice@example.com')])).toEqual([])
    expect(
      await names([cond('email', 'eq', 'alice@example.com', { mode: 'insensitive' })]),
    ).toEqual(['Alice'])
    expect(await names([cond('email', 'contains', 'EXAMPLE')])).toEqual([])
    expect(
      await names([cond('email', 'contains', 'EXAMPLE', { mode: 'insensitive' })]),
    ).toEqual(['Alice', 'Bob'])
    expect(
      await names([cond('name', 'in', ['ALICE', 'bob'], { mode: 'insensitive' })]),
    ).toEqual(['Alice', 'Bob'])
  })

  it('treats null values as IS NULL / IS NOT NULL', async () => {
    expect(await names([cond('image', 'eq', null)])).toEqual(['Alice', 'Carol'])
    expect(await names([cond('image', 'ne', null)])).toEqual(['Bob', 'Dave'])
  })

  it('combines AND and OR connectors', async () => {
    // Conditions that are all OR form a single OR group.
    expect(
      await names([
        cond('score', 'eq', 10, { connector: 'OR' }),
        cond('score', 'eq', 40, { connector: 'OR' }),
      ]),
    ).toEqual(['Alice', 'Dave'])

    // (domain is sample.org) AND (score = 10 OR score = 40)
    expect(
      await names([
        cond('email', 'ends_with', '.org'),
        cond('score', 'eq', 10, { connector: 'OR' }),
        cond('score', 'eq', 40, { connector: 'OR' }),
      ]),
    ).toEqual(['Dave'])
  })

  it('counts with and without filters', async () => {
    expect(await adapter.count({ model: 'user' })).toBe(4)
    expect(
      await adapter.count({ model: 'user', where: [cond('score', 'gt', 15)] as never }),
    ).toBe(3)
  })

  it('treats malicious values as data, not SQL', async () => {
    const payload = `' OR 1=1; DROP TABLE "${schemaName}"."user"; --`

    expect(await names([cond('name', 'eq', payload)])).toEqual([])
    expect(await names([cond('name', 'contains', payload)])).toEqual([])
    expect(await names([cond('name', 'in', [payload])])).toEqual([])

    const created = await adapter.create<{
      id: string
      name: string
      email: string
      score: number
      emailVerified: boolean
      createdAt: Date
      updatedAt: Date
    }>({
      model: 'user',
      data: {
        name: payload,
        email: 'inject@example.com',
        score: 1,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    expect(created.name).toBe(payload)
    expect(await names([cond('name', 'eq', payload)])).toEqual([payload])

    await adapter.deleteMany({
      model: 'user',
      where: [cond('email', 'eq', 'inject@example.com')] as never,
    })
    expect(await adapter.count({ model: 'user' })).toBe(4)
  })

  it('quotes field names so they cannot break out of the identifier', async () => {
    // The payload is quoted into a nonexistent column, so Postgres errors instead of running it.
    await expect(names([cond('name"; DROP TABLE "x', 'eq', 'a')])).rejects.toThrow()
    expect(await adapter.count({ model: 'user' })).toBe(4)
  })

  // Row locking must key on id, not ctid: a concurrent update changes the ctid and loses the write.
  it('serves concurrent increments without lost updates', async () => {
    const created = await adapter.create<{ id: string }>({
      model: 'user',
      data: {
        name: 'Counter',
        email: 'counter@example.com',
        score: 0,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    await Promise.all(
      Array.from({ length: 25 }, () =>
        adapter.incrementOne({
          model: 'user',
          where: [cond('id', 'eq', created.id)] as never,
          increment: { score: 1 },
        }),
      ),
    )

    const row = await adapter.findOne<{ score: number }>({
      model: 'user',
      where: [cond('id', 'eq', created.id)] as never,
    })
    expect(row?.score).toBe(25)
  })

  // Same locking concern as incrementOne above.
  it('lets only one concurrent consumeOne win', async () => {
    const created = await adapter.create<{ id: string }>({
      model: 'user',
      data: {
        name: 'Once',
        email: 'once@example.com',
        score: 0,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        adapter.consumeOne({
          model: 'user',
          where: [cond('id', 'eq', created.id)] as never,
        }),
      ),
    )
    expect(results.filter((r) => r !== null)).toHaveLength(1)
  })
})

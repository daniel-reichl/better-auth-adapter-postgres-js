import type { CleanedWhere } from 'better-auth/adapters'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

import {
  buildCondition,
  buildOrderByClause,
  buildPaginationClause,
  buildTableRef,
  buildWhereClause,
  combineFragments,
} from './builder.ts'

interface QueryInspectable {
  strings: string[]
  args: unknown[]
}

function inspectQuery(fragment: unknown): QueryInspectable {
  return fragment as unknown as QueryInspectable
}

describe('builder', () => {
  const sql = postgres({ max: 1 })

  afterAll(async () => {
    await sql.end()
  })

  const resolveColumn = (field: string): string => {
    if (field === 'userId') return 'user_id'
    if (field === 'emailVerified') return 'email_verified'
    return field
  }

  describe('buildTableRef', () => {
    it('builds table reference without schema', () => {
      const ref = buildTableRef(sql, { table: 'users' })
      expect(inspectQuery(ref).strings).toBeDefined()
    })

    it('builds table reference with schema qualification', () => {
      const ref = buildTableRef(sql, { schema: 'my_schema', table: 'users' })
      expect(inspectQuery(ref).strings).toBeDefined()
    })
  })

  describe('buildCondition', () => {
    it('handles eq operator with scalar value', () => {
      const where: CleanedWhere = {
        field: 'email',
        operator: 'eq',
        value: 'test@example.com',
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(cond).toBeDefined()
    })

    it('handles eq operator with NULL', () => {
      const where: CleanedWhere = {
        field: 'deletedAt',
        operator: 'eq',
        value: null,
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, (f) =>
        f === 'deletedAt' ? 'deleted_at' : f,
      )
      expect(inspectQuery(cond).strings.join('')).toContain('IS NULL')
    })

    it('handles eq operator with mode insensitive', () => {
      const where: CleanedWhere = {
        field: 'email',
        operator: 'eq',
        value: 'Test@example.com',
        connector: 'AND',
        mode: 'insensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('LOWER(')
    })

    it('handles ne operator with scalar value', () => {
      const where: CleanedWhere = {
        field: 'role',
        operator: 'ne',
        value: 'admin',
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(cond).toBeDefined()
    })

    it('handles ne operator with NULL', () => {
      const where: CleanedWhere = {
        field: 'deletedAt',
        operator: 'ne',
        value: null,
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, (f) =>
        f === 'deletedAt' ? 'deleted_at' : f,
      )
      expect(inspectQuery(cond).strings.join('')).toContain('IS NOT NULL')
    })

    it('handles comparison operators (lt, lte, gt, gte)', () => {
      const ops = ['lt', 'lte', 'gt', 'gte'] as const
      for (const op of ops) {
        const where: CleanedWhere = {
          field: 'count',
          operator: op,
          value: 10,
          connector: 'AND',
          mode: 'sensitive',
        }
        const cond = buildCondition(sql, where, resolveColumn)
        expect(cond).toBeDefined()
      }
    })

    it('handles in operator with non-empty array', () => {
      const where: CleanedWhere = {
        field: 'userId',
        operator: 'in',
        value: ['id1', 'id2'],
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('ANY(')
    })

    it('handles in operator with empty array safely as false', () => {
      const where: CleanedWhere = {
        field: 'userId',
        operator: 'in',
        value: [],
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('1 = 0')
    })

    it('handles in operator with case-insensitivity', () => {
      const where: CleanedWhere = {
        field: 'email',
        operator: 'in',
        value: ['A@b.com', 'C@d.com'],
        connector: 'AND',
        mode: 'insensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('LOWER(')
    })

    it('handles not_in operator with non-empty array', () => {
      const where: CleanedWhere = {
        field: 'userId',
        operator: 'not_in',
        value: ['id1', 'id2'],
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('ALL(')
    })

    it('handles not_in operator with empty array safely as true', () => {
      const where: CleanedWhere = {
        field: 'userId',
        operator: 'not_in',
        value: [],
        connector: 'AND',
        mode: 'sensitive',
      }
      const cond = buildCondition(sql, where, resolveColumn)
      expect(inspectQuery(cond).strings.join('')).toContain('1 = 1')
    })

    it('handles contains operator', () => {
      const sensitive: CleanedWhere = {
        field: 'name',
        operator: 'contains',
        value: 'acme',
        connector: 'AND',
        mode: 'sensitive',
      }
      const insensitive: CleanedWhere = {
        field: 'name',
        operator: 'contains',
        value: 'acme',
        connector: 'AND',
        mode: 'insensitive',
      }
      expect(
        inspectQuery(buildCondition(sql, sensitive, resolveColumn)).strings.join(''),
      ).toContain('LIKE')
      expect(
        inspectQuery(buildCondition(sql, insensitive, resolveColumn)).strings.join(''),
      ).toContain('ILIKE')
    })

    it('handles starts_with operator', () => {
      const sensitive: CleanedWhere = {
        field: 'name',
        operator: 'starts_with',
        value: 'acme',
        connector: 'AND',
        mode: 'sensitive',
      }
      const insensitive: CleanedWhere = {
        field: 'name',
        operator: 'starts_with',
        value: 'acme',
        connector: 'AND',
        mode: 'insensitive',
      }
      expect(
        inspectQuery(buildCondition(sql, sensitive, resolveColumn)).strings.join(''),
      ).toContain('LIKE')
      expect(
        inspectQuery(buildCondition(sql, insensitive, resolveColumn)).strings.join(''),
      ).toContain('ILIKE')
    })

    it('handles ends_with operator', () => {
      const sensitive: CleanedWhere = {
        field: 'name',
        operator: 'ends_with',
        value: 'acme',
        connector: 'AND',
        mode: 'sensitive',
      }
      const insensitive: CleanedWhere = {
        field: 'name',
        operator: 'ends_with',
        value: 'acme',
        connector: 'AND',
        mode: 'insensitive',
      }
      expect(
        inspectQuery(buildCondition(sql, sensitive, resolveColumn)).strings.join(''),
      ).toContain('LIKE')
      expect(
        inspectQuery(buildCondition(sql, insensitive, resolveColumn)).strings.join(''),
      ).toContain('ILIKE')
    })
  })

  describe('buildWhereClause and combineFragments', () => {
    it('returns null when where is undefined or empty', () => {
      expect(buildWhereClause(sql, undefined, resolveColumn)).toBeNull()
      expect(buildWhereClause(sql, [], resolveColumn)).toBeNull()
    })

    it('builds where clause with AND conditions', () => {
      const where: CleanedWhere[] = [
        {
          field: 'userId',
          operator: 'eq',
          value: 'user-1',
          connector: 'AND',
          mode: 'sensitive',
        },
        {
          field: 'emailVerified',
          operator: 'eq',
          value: true,
          connector: 'AND',
          mode: 'sensitive',
        },
      ]
      const clause = buildWhereClause(sql, where, resolveColumn)
      expect(clause).not.toBeNull()
      expect(inspectQuery(clause).strings.join('')).toContain('AND')
    })

    it('builds where clause with OR conditions', () => {
      const where: CleanedWhere[] = [
        {
          field: 'role',
          operator: 'eq',
          value: 'admin',
          connector: 'OR',
          mode: 'sensitive',
        },
        {
          field: 'role',
          operator: 'eq',
          value: 'owner',
          connector: 'OR',
          mode: 'sensitive',
        },
      ]
      const clause = buildWhereClause(sql, where, resolveColumn)
      expect(clause).not.toBeNull()
      expect(inspectQuery(clause).strings.join('')).toContain('OR')
    })

    it('combines mixed AND and OR conditions', () => {
      const where: CleanedWhere[] = [
        {
          field: 'userId',
          operator: 'eq',
          value: 'user-1',
          connector: 'AND',
          mode: 'sensitive',
        },
        {
          field: 'role',
          operator: 'eq',
          value: 'admin',
          connector: 'OR',
          mode: 'sensitive',
        },
      ]
      const clause = buildWhereClause(sql, where, resolveColumn)
      expect(clause).not.toBeNull()
      expect(inspectQuery(clause).strings.join('')).toContain(') AND (')
    })

    it('combineFragments returns null for empty array', () => {
      expect(combineFragments(sql, [], 'AND')).toBeNull()
    })
  })

  describe('buildOrderByClause', () => {
    it('returns null when sortBy is undefined', () => {
      expect(buildOrderByClause(sql, undefined, resolveColumn)).toBeNull()
    })

    it('builds ORDER BY ASC', () => {
      const clause = buildOrderByClause(
        sql,
        { field: 'userId', direction: 'asc' },
        resolveColumn,
      )
      expect(clause).not.toBeNull()
      expect(inspectQuery(clause).strings.join('')).toContain('ORDER BY')
    })

    it('builds ORDER BY DESC', () => {
      const clause = buildOrderByClause(
        sql,
        { field: 'userId', direction: 'desc' },
        resolveColumn,
      )
      expect(clause).not.toBeNull()
      expect(inspectQuery(clause).strings.join('')).toContain('ORDER BY')
    })
  })

  describe('buildPaginationClause', () => {
    it('returns null when limit and offset are omitted', () => {
      expect(buildPaginationClause(sql)).toBeNull()
    })

    it('builds LIMIT only', () => {
      const clause = buildPaginationClause(sql, 10)
      expect(inspectQuery(clause).strings.join('')).toContain('LIMIT')
      expect(inspectQuery(clause).args).toEqual([10])
    })

    it('builds OFFSET only', () => {
      const clause = buildPaginationClause(sql, undefined, 20)
      expect(inspectQuery(clause).strings.join('')).toContain('OFFSET')
      expect(inspectQuery(clause).args).toEqual([20])
    })

    it('builds LIMIT and OFFSET together', () => {
      const clause = buildPaginationClause(sql, 10, 20)
      expect(inspectQuery(clause).strings.join('')).toContain('LIMIT')
      expect(inspectQuery(clause).strings.join('')).toContain('OFFSET')
      expect(inspectQuery(clause).args).toEqual([10, 20])
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  mapRecordToColumns,
  mapRowToFields,
  pluralize,
  resolveColumnName,
  resolveFieldName,
  resolveTableName,
  toCamelCase,
  toSnakeCase,
} from './mapping.ts'

describe('mapping', () => {
  describe('toSnakeCase', () => {
    it('converts camelCase strings to snake_case', () => {
      expect(toSnakeCase('userId')).toBe('user_id')
      expect(toSnakeCase('emailVerified')).toBe('email_verified')
      expect(toSnakeCase('activeOrganizationId')).toBe('active_organization_id')
    })

    it('preserves existing snake_case strings', () => {
      expect(toSnakeCase('user_id')).toBe('user_id')
      expect(toSnakeCase('created_at')).toBe('created_at')
    })

    it('handles acronyms and consecutive capitals', () => {
      expect(toSnakeCase('organizationID')).toBe('organization_id')
      expect(toSnakeCase('ID')).toBe('id')
    })
  })

  describe('toCamelCase', () => {
    it('converts snake_case strings to camelCase', () => {
      expect(toCamelCase('user_id')).toBe('userId')
      expect(toCamelCase('email_verified')).toBe('emailVerified')
      expect(toCamelCase('active_organization_id')).toBe('activeOrganizationId')
    })

    it('preserves strings without underscores', () => {
      expect(toCamelCase('email')).toBe('email')
      expect(toCamelCase('id')).toBe('id')
    })
  })

  describe('pluralize', () => {
    it('pluralizes regular nouns by appending s', () => {
      expect(pluralize('user')).toBe('users')
      expect(pluralize('session')).toBe('sessions')
      expect(pluralize('account')).toBe('accounts')
    })

    it('pluralizes nouns ending in s, x, z, ch, sh by appending es', () => {
      expect(pluralize('pass')).toBe('passes')
      expect(pluralize('box')).toBe('boxes')
      expect(pluralize('match')).toBe('matches')
    })

    it('pluralizes consonant-y nouns to ies', () => {
      expect(pluralize('category')).toBe('categories')
      expect(pluralize('city')).toBe('cities')
    })

    it('pluralizes vowel-y nouns by appending s', () => {
      expect(pluralize('day')).toBe('days')
      expect(pluralize('key')).toBe('keys')
    })
  })

  describe('resolveTableName', () => {
    it('uses modelMap override for modelKey when available', () => {
      const res = resolveTableName(
        { model: 'session', modelKey: 'session' },
        { modelMap: { session: 'user_sessions' } },
      )
      expect(res).toEqual({ schema: undefined, table: 'user_sessions' })
    })

    it('uses modelMap override for model when modelKey is omitted', () => {
      const res = resolveTableName({ model: 'user' }, { modelMap: { user: 'users' } })
      expect(res).toEqual({ schema: undefined, table: 'users' })
    })

    it('applies schema qualification from options.schema', () => {
      const res = resolveTableName(
        { model: 'user' },
        { schema: 'app_test', modelMap: { user: 'users' } },
      )
      expect(res).toEqual({ schema: 'app_test', table: 'users' })
    })

    it('parses schema from table name containing a dot', () => {
      const res = resolveTableName(
        { model: 'user' },
        { modelMap: { user: 'custom_schema.my_users' } },
      )
      expect(res).toEqual({ schema: 'custom_schema', table: 'my_users' })
    })

    it('applies pluralization when usePlural is true and no map exists', () => {
      const res = resolveTableName({ model: 'user' }, { usePlural: true })
      expect(res).toEqual({ schema: undefined, table: 'users' })
    })

    it('applies snake_case casing when casing is snake_case', () => {
      const res = resolveTableName(
        { model: 'verificationToken' },
        { casing: 'snake_case' },
      )
      expect(res).toEqual({ schema: undefined, table: 'verification_token' })
    })

    it('preserves raw model name by default', () => {
      const res = resolveTableName({ model: 'userProfile' })
      expect(res).toEqual({ schema: undefined, table: 'userProfile' })
    })
  })

  describe('resolveColumnName', () => {
    it('uses fieldMap override for modelKey when present', () => {
      const col = resolveColumnName(
        'user',
        'displayName',
        { fieldMap: { user: { displayName: 'name' } } },
        'user',
      )
      expect(col).toBe('name')
    })

    it('uses fieldMap override for model when present', () => {
      const col = resolveColumnName('user', 'emailAddress', {
        fieldMap: { user: { emailAddress: 'email' } },
      })
      expect(col).toBe('email')
    })

    it('converts to snake_case when casing strategy is snake_case', () => {
      const col = resolveColumnName('user', 'emailVerified', {
        casing: 'snake_case',
      })
      expect(col).toBe('email_verified')
    })

    it('preserves field name by default', () => {
      const col = resolveColumnName('user', 'emailVerified')
      expect(col).toBe('emailVerified')
    })
  })

  describe('resolveFieldName', () => {
    it('inverts fieldMap override to return model field', () => {
      const field = resolveFieldName(
        'user',
        'name',
        { fieldMap: { user: { displayName: 'name' } } },
        'user',
      )
      expect(field).toBe('displayName')
    })

    it('converts snake_case column to camelCase when casing is snake_case', () => {
      const field = resolveFieldName('user', 'email_verified', {
        casing: 'snake_case',
      })
      expect(field).toBe('emailVerified')
    })

    it('preserves column name by default', () => {
      const field = resolveFieldName('user', 'email_verified')
      expect(field).toBe('email_verified')
    })
  })

  describe('mapRecordToColumns and mapRowToFields', () => {
    it('maps object fields to database columns and back', () => {
      const options = {
        casing: 'snake_case' as const,
        fieldMap: {
          user: {
            displayName: 'name',
          },
        },
      }

      const input = {
        id: 'user-1',
        displayName: 'Alice',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }

      const columns = mapRecordToColumns(input, 'user', options)
      expect(columns).toEqual({
        id: 'user-1',
        name: 'Alice',
        email_verified: true,
        created_at: input.createdAt,
      })

      const roundtrip = mapRowToFields<typeof input>(columns, 'user', options)
      expect(roundtrip).toEqual(input)
    })
  })
})

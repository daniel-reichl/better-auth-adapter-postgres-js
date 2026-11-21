import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  joinsTestSuite,
  normalTestSuite,
  numberIdTestSuite,
  testAdapter,
  transactionsTestSuite,
  uuidTestSuite,
} from '@better-auth/test-utils/adapter'
import { afterAll } from 'vitest'

import { createTestSchema, createTestSql, dropTestSchema } from './+helpers.ts'
import { postgresJsAdapter } from '../src/index.ts'

const schemaName = 'adapter_suite_test'

const sql = createTestSql({ prepare: false })

afterAll(async () => {
  await dropTestSchema(sql, schemaName)
})

const { execute } = await testAdapter({
  adapter: () => postgresJsAdapter(sql, { schema: schemaName }),
  // Suites change id generation and plugins between runs, so the schema is rebuilt from the current options each time.
  runMigrations: async (betterAuthOptions) => {
    await createTestSchema(sql, schemaName)
    const adapter = postgresJsAdapter(sql, { schema: schemaName })(betterAuthOptions)
    const generated = await adapter.createSchema?.(betterAuthOptions)
    await sql.unsafe(generated?.code ?? '')
  },
  tests: [
    normalTestSuite(),
    transactionsTestSuite({ disableTests: { ALL: false } }),
    authFlowTestSuite(),
    numberIdTestSuite(),
    uuidTestSuite(),
    joinsTestSuite(),
    caseInsensitiveTestSuite(),
  ],
})

execute()

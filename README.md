# better-auth-adapter-postgres-js

[Better Auth](https://better-auth.com) database adapter for [postgres.js](https://github.com/porsager/postgres).

## Install

```sh
npm install better-auth-adapter-postgres-js better-auth postgres
```

## Usage

```ts
import { betterAuth } from 'better-auth'
import postgres from 'postgres'
import { postgresJsAdapter } from 'better-auth-adapter-postgres-js'

const sql = postgres(process.env.DATABASE_URL!)

export const auth = betterAuth({
  database: postgresJsAdapter(sql),
})
```

See `src/types.ts` for available options.

## Tests

Run all tests with `npm run test`. Integration tests need a Postgres instance (`DATABASE_URL`, e.g. `postgres://user:password@localhost:5432/test`). Run only unit tests with `npm run test unit`.

## License

MIT

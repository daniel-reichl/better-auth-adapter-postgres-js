import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    unstubEnvs: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 10_000,
  },
})

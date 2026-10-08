import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // The shared fork worker imports every test module and several database
    // pools; under machine load its shutdown can exceed the default 10s and
    // trip "[vitest-pool] Timeout terminating forks worker". Allow a graceful
    // drain instead of killing the worker mid-teardown.
    teardownTimeout: 30000,
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.js', 'src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**'],
      exclude: ['src/**/*.d.ts', 'src/database/**', 'src/**/index.ts'],
    },
  },
});

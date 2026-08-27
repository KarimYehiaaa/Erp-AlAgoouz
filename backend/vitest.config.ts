import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
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

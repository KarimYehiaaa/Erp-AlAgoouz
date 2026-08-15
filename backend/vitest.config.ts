import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.js', 'src/**/*.test.js'],
  },
});

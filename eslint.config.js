import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  { ignores: ['**/dist/', '**/node_modules/', 'logs/', 'backups/', '.gemini/'] },

  // Base JS recommended rules
  js.configs.recommended,

  // Backend: Node.js files
  {
    files: ['backend/src/**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'prefer-const': 'warn',
      // Transitional: downgrade to warn during migration, upgrade to error after cleanup
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'no-undef': 'warn',
      'no-dupe-keys': 'error',
    },
  },

  // Backend tests
  {
    files: ['backend/test/**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },

  // Frontend: Vue + JS files
  {
    files: ['frontend/src/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      // Transitional
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
    },
  },

  // Scripts
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Prettier must be last — disables formatting rules that conflict
  prettierConfig,
];

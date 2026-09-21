import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  { ignores: ['**/dist/', '**/node_modules/', 'logs/', 'backups/', '.gemini/', 'backend/scripts/archive/'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (applies to .ts/.tsx/.mts/.cts files only)
  ...tseslint.configs.recommended,

  // Backend: Node.js files
  {
    files: ['backend/src/**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // TypeScript's rule understands types and prevents duplicate diagnostics
      // from the base JavaScript rule.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
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
    files: ['backend/tests/**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },

  // Frontend: Vue files (.vue) — parsed with vue-eslint-parser + TS parser inside
  {
    files: ['frontend/src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser },
    },
    plugins: {
      vue: pluginVue,
    },
    rules: {
      // Transitional (matches the rest of the project)
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Transitional: @ts-nocheck موجود في ملفات كبيرة (Dashboard/Sales) لم تُفحص نوعيًا بعد
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
    },
  },

  // Frontend: Vue + JS/TS files
  {
    files: ['frontend/src/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      // Transitional
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
    },
  },

  // Scripts (الجذر + backend — أدوات صيانة تعمل بـ Node مباشرة)
  {
    files: ['scripts/**/*.{js,mjs,ts}', 'backend/*.{js,mjs,ts}', 'backend/scripts/**/*.{js,mjs,ts}'],
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

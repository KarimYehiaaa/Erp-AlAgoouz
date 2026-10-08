import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production database configuration', () => {
  it('does not silently fall back to localhost when no production database is configured', () => {
    const configUrl = new URL('../src/config/index.ts', import.meta.url).href;
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      VERCEL: '',
      VERCEL_ENV: '',
      VERCEL_URL: '',
      DATABASE_URL: '',
      DB_HOST: '',
      DB_PORT: '5432',
      DB_NAME: 'fixture_test',
      DB_USER: 'fixture',
      DB_PASSWORD: 'fictional-password',
      DB_SSL: 'false',
      JWT_SECRET: 'fictional-access-secret-for-production-config-test',
      JWT_REFRESH_SECRET: 'fictional-refresh-secret-for-production-config-test',
      BACKUP_ENCRYPTION_KEY: 'fictional-backup-encryption-key-for-config-test',
      SUPPRESS_CONFIG_LOG: '1',
    };

    let failure = '';
    try {
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(configUrl)})`,
        ],
        { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
      );
    } catch (error) {
      const childError = error as NodeJS.ErrnoException & { stderr?: string | Buffer };
      failure = String(childError.stderr || childError.message);
    }

    expect(failure, failure).toContain('DATABASE_URL or DB_HOST');
    expect(failure).not.toContain('DB: localhost');
  });

  it('ships no production-usable JWT secrets in either environment template', () => {
    for (const path of ['../../.env.example', '../.env.example']) {
      const template = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(template).toMatch(/^JWT_SECRET=\s*$/m);
      expect(template).toMatch(/^JWT_REFRESH_SECRET=\s*$/m);
      expect(template).not.toMatch(/^JWT_SECRET=.{32,}$/m);
      expect(template).not.toMatch(/^JWT_REFRESH_SECRET=.{32,}$/m);
    }

    const rootTemplate = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    const backendTemplate = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    const rootKeys = new Set([...rootTemplate.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
    const backendKeys = [...backendTemplate.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    expect(backendKeys.filter((key) => !rootKeys.has(key))).toEqual([]);

    const configUrl = new URL('../src/config/index.ts', import.meta.url).href;
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      VERCEL: '',
      VERCEL_ENV: '',
      VERCEL_URL: '',
      DATABASE_URL: '',
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_NAME: 'fixture_test',
      DB_USER: 'fixture',
      DB_PASSWORD: 'fictional-password',
      DB_SSL: 'false',
      JWT_SECRET: '',
      JWT_REFRESH_SECRET: '',
      BACKUP_ENCRYPTION_KEY: 'fictional-backup-encryption-key-for-config-test',
      SUPPRESS_CONFIG_LOG: '1',
    };

    let failure = '';
    try {
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(configUrl)})`,
        ],
        { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
      );
    } catch (error) {
      const childError = error as NodeJS.ErrnoException & { stderr?: string | Buffer };
      failure = String(childError.stderr || childError.message);
    }

    expect(failure, failure).toContain('JWT_SECRET');
  });
});

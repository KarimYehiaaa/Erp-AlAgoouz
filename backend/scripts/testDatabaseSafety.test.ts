import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSafeTestDatabase } from './testDatabaseSafety.ts';

test('permits local isolated test and restore databases', () => {
  for (const host of ['localhost', '127.0.0.1', '::1']) {
    for (const database of ['bin_al_ajouz_test', 'bin_al_ajouz_restore_test']) {
      assert.doesNotThrow(() => assertSafeTestDatabase({ host, database }));
    }
  }
  assert.doesNotThrow(() => assertSafeTestDatabase({
    connectionString: 'postgresql://user:password@[::1]:5432/erp_test',
  }));
});

test('rejects missing, remote and non-test targets', () => {
  for (const target of [
    {},
    { host: 'database.example', database: 'erp_test' },
    { host: 'localhost', database: 'postgres' },
    { host: 'localhost', database: 'erp_test_production' },
    { host: 'localhost', database: '../erp_test' },
    { connectionString: 'postgres://localhost:secret@remote.example/erp_test' },
    { connectionString: 'postgres://localhost.evil.example/erp_test' },
    { connectionString: 'postgres://localhost/erp_test?host=remote.example' },
    { connectionString: 'postgres://localhost/erp_test?dbname=production' },
    { connectionString: 'postgres://localhost/production' },
    { connectionString: 'invalid' },
  ]) {
    assert.throws(() => assertSafeTestDatabase(target), /Unsafe test database target/);
  }
});

test('runner rejects unsafe environment before starting setup or migrations', () => {
  for (const env of [
    { DB_HOST: 'unsafe.invalid', DB_NAME: 'erp_test' },
    { DB_HOST: 'localhost', DB_NAME: 'production' },
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-vitest-local.ts', import.meta.url))], {
      env: { ...process.env, ...env, DB_PASSWORD: 'test-only', POSTGRES_PASSWORD: 'test-only' },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsafe test database target/);
    assert.equal(result.stdout, '');
  }
});

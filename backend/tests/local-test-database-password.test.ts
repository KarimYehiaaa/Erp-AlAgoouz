import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveLocalTestDatabasePassword } from '../scripts/localTestDatabasePassword.ts';

let temporaryDirectory: string | undefined;
let localPasswordFile: string | undefined;

afterEach(() => {
  if (localPasswordFile) rmSync(localPasswordFile, { force: true });
  if (temporaryDirectory) rmdirSync(temporaryDirectory);
  localPasswordFile = undefined;
  temporaryDirectory = undefined;
});

function passwordFile(contents: string) {
  temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'local-test-database-password-'));
  localPasswordFile = path.join(temporaryDirectory, '.postgres.local');
  writeFileSync(localPasswordFile, contents, 'utf8');
  return localPasswordFile;
}

it('requires explicit local PostgreSQL credentials when no password source is configured', () => {
  expect(() =>
    resolveLocalTestDatabasePassword({
      environment: {},
      localPasswordFile: 'missing-local-postgres-password',
    }),
  ).toThrow(/POSTGRES_PASSWORD or DB_PASSWORD/);
});

it('uses an explicit environment password before reading the local file', () => {
  const localFile = passwordFile('file-password');
  expect(
    resolveLocalTestDatabasePassword({
      environment: { POSTGRES_PASSWORD: 'environment-password' },
      localPasswordFile: localFile,
    }),
  ).toBe('environment-password');
});

it('accepts DB_PASSWORD when POSTGRES_PASSWORD is not set', () => {
  expect(
    resolveLocalTestDatabasePassword({
      environment: { DB_PASSWORD: 'database-password' },
      localPasswordFile: 'missing-local-password-file',
    }),
  ).toBe('database-password');
});

it('reads and trims the local password file when no environment password is set', () => {
  const localFile = passwordFile('local-file-password\r\n');
  expect(resolveLocalTestDatabasePassword({ environment: {}, localPasswordFile: localFile })).toBe(
    'local-file-password',
  );
});

it('uses the standard PostgreSQL password for CI when no override exists', () => {
  expect(
    resolveLocalTestDatabasePassword({
      environment: { CI: 'true' },
      localPasswordFile: 'missing-ci-password-file',
    }),
  ).toBe('postgres');
});

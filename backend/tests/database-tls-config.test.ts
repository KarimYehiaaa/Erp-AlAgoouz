import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootCertificates } from 'node:tls';
import { createHash } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import pg from 'pg';
import { resolveDatabaseSsl } from '../src/database/tlsConfig.ts';

const scratchRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scratch');
fs.mkdirSync(scratchRoot, { recursive: true });
const directory = fs.mkdtempSync(path.join(scratchRoot, 'tls-config-test-'));
const certificate = rootCertificates[0];
fs.writeFileSync(path.join(directory, 'trusted-ca.pem'), certificate, { mode: 0o600 });
afterAll(() => {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${scratchRoot}${path.sep}`))
    throw new Error('Unsafe TLS fixture cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
});

it('uses strict TLS for cloud endpoints and preserves explicit loopback plain connections', () => {
  for (const connection of [
    { host: 'aws-0-eu-north-1.pooler.supabase.com' },
    { connectionString: 'postgresql://fixture:fixture@db.example.supabase.co:5432/postgres' },
  ]) {
    const ssl = resolveDatabaseSsl(connection, {}, directory);
    expect(ssl).toMatchObject({ rejectUnauthorized: true });
    expect(ssl && createHash('sha256').update(ssl.ca!).digest('hex')).toBe(
      '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7',
    );
    expect(() =>
      resolveDatabaseSsl(connection, { DB_SSL_REJECT_UNAUTHORIZED: 'false' }, directory),
    ).toThrow('verification cannot be disabled');
  }
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    expect(
      resolveDatabaseSsl(
        { connectionString: `postgresql://fixture:fixture@${hostname}:5432/fixture_test` },
        { DB_SSL: 'false' },
        directory,
      ),
    ).toBe(false);
  }
  expect(resolveDatabaseSsl({ host: 'localhost' }, { DB_SSL: 'true' }, directory)).toEqual({
    rejectUnauthorized: true,
  });
  for (const host of ['supabase.com.attacker.example', 'notsupabase.com', 'neon.tech']) {
    expect(
      resolveDatabaseSsl(
        { connectionString: `postgresql://fixture:fixture@${host}/postgres` },
        {},
        directory,
      ),
    ).toEqual({ rejectUnauthorized: true });
  }
});

it('rejects URI TLS overrides before pg can replace verification or read client key paths', () => {
  for (const [key, value] of [
    ['ssl', 'no-verify'],
    ['ssl', '0'],
    ['sslmode', 'no-verify'],
    ['sslmode', 'verify-full'],
    ['sslrootcert', 'missing-ca.pem'],
    ['sslcert', 'missing-client.pem'],
    ['sslkey', 'missing-key.pem'],
    ['uselibpqcompat', 'true'],
    ['sslnegotiation', 'direct'],
  ]) {
    const uri = `postgresql://fixture:fixture@db.example.supabase.co/postgres?${key}=${value}`;
    expect(() =>
      resolveDatabaseSsl(
        { connectionString: uri },
        { DB_SSL_CA_FILE: 'trusted-ca.pem' },
        directory,
      ),
    ).toThrow('TLS overrides');
  }
});

it('keeps the supplied CA and verification in actual pg connection parameters', () => {
  const connectionString =
    'postgresql://fixture:fixture@aws-0-eu.pooler.supabase.com:6543/postgres?application_name=fixture';
  const ssl = resolveDatabaseSsl(
    { connectionString },
    { DB_SSL_CA_FILE: 'trusted-ca.pem' },
    directory,
  );
  const client = new pg.Client({ connectionString, ssl });
  // Construct only: no network request or live authentication takes place.
  expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
    ssl: { rejectUnauthorized: true, ca: certificate },
    port: 6543,
    host: 'aws-0-eu.pooler.supabase.com',
  });
});

it('fails closed on missing, invalid, or key-bearing CA files without exposing their content', () => {
  const fixtureSecret = 'isolated-fixture-content-must-not-appear-in-errors';
  fs.writeFileSync(
    path.join(directory, 'invalid.pem'),
    `-----BEGIN CERTIFICATE-----\n${fixtureSecret}\n-----END CERTIFICATE-----`,
  );
  fs.writeFileSync(
    path.join(directory, 'private.pem'),
    `${certificate}\n-----BEGIN PRIVATE KEY-----\n${fixtureSecret}\n-----END PRIVATE KEY-----`,
  );
  for (const file of ['missing.pem', 'invalid.pem', 'private.pem']) {
    let message = '';
    try {
      resolveDatabaseSsl({ host: 'localhost' }, { DB_SSL_CA_FILE: file }, directory);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DB_SSL_CA_FILE');
    expect(message).not.toContain(fixtureSecret);
  }
});

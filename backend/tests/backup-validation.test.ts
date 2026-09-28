import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
const { getClient, query, release } = vi.hoisted(() => ({
  getClient: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../src/database/pool.ts', () => ({ getClient }));
import { BACKUP_TABLES, restoreBackup, clearAllData } from '../src/services/backupService.ts';

const snapshot = () => Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  release.mockReset();
  getClient.mockReset().mockResolvedValue({ query, release });
});
afterEach(() => vi.restoreAllMocks());

it.each([
  [null],
  [1],
  [[]],
  [{}],
  [{ id: 1, 'bad-column': 2 }],
  [{ id: 1 }, { id: 2, name_ar: 'must not be silently lost' }],
  [{ id: 1, name_ar: 'required shape' }, { id: 2 }],
])('rejects malformed row collection before database access: %j', async (...rows) => {
  const data = { ...snapshot(), products: rows };
  vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({ data }));
  await expect(restoreBackup('invalid.json')).rejects.toMatchObject({ statusCode: 400 });
  expect(getClient).not.toHaveBeenCalled();
});

it('rejects malformed JSON with a client error before database access', async () => {
  vi.spyOn(fs, 'readFile').mockResolvedValue('{broken');
  await expect(restoreBackup('invalid.json')).rejects.toMatchObject({ statusCode: 400 });
  expect(getClient).not.toHaveBeenCalled();
});

it('stops restore immediately on replication-role permission failure', async () => {
  vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({ data: snapshot() }));
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SET LOCAL'))
      throw Object.assign(new Error('permission denied'), { code: '42501' });
    return { rows: [] };
  });
  await expect(restoreBackup('valid.json')).rejects.toBeDefined();
  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    'BEGIN',
    "SET LOCAL session_replication_role = 'replica'",
    'ROLLBACK',
  ]);
  expect(release).toHaveBeenCalledOnce();
});

it('rolls back reset when the schema has an unreviewed table', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM pg_tables')) {
      return { rows: [{ tablename: 'products' }, { tablename: 'unexpected_financial_data' }] };
    }
    return { rows: [] };
  });
  await expect(clearAllData()).rejects.toMatchObject({ statusCode: 409 });
  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    'BEGIN',
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    'ROLLBACK',
  ]);
  expect(release).toHaveBeenCalledOnce();
});

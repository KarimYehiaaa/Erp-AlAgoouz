import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

type Query = (sql: string) => Promise<{ rows: unknown[] }>;

/** Adopt only the exact original schema; later schemas require their real migration history. */
export const resolveLegacyMigrationBaseline = async (query: Query): Promise<string[]> => {
  const expected = JSON.parse(
    fs.readFileSync(new URL('./legacyBaseSchema.json', import.meta.url), 'utf8'),
  );
  const fingerprint = await query(
    fs.readFileSync(new URL('./legacySchemaFingerprint.sql', import.meta.url), 'utf8'),
  );
  if (!isDeepStrictEqual(fingerprint.rows, expected)) {
    throw new Error(
      'Migration history is missing and the existing schema does not match the original 001/002 baseline. ' +
        'Recover schema_migrations from a verified backup; refusing to guess versions or replay changes over existing data.',
    );
  }
  const seed = await query("SELECT EXISTS(SELECT 1 FROM roles WHERE name='admin') AS seeded");
  if (!(seed.rows[0] as { seeded: boolean } | undefined)?.seeded) {
    throw new Error(
      'Original schema has no verified bootstrap role; refusing to infer seed migration history.',
    );
  }
  return ['001_schema.sql', '002_seed.sql'];
};

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Database/application schema contracts', () => {
  it('defines warehouses.branch_id before branch isolation queries it', () => {
    const migrationDir = path.resolve(process.cwd(), 'migrations');
    const migrationText = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8'))
      .join('\n');

    expect(migrationText).toMatch(/ALTER TABLE warehouses[\s\S]*ADD COLUMN IF NOT EXISTS branch_id INT/);
  });
});

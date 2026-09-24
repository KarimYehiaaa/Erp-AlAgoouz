import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { readPendingQueue, writePendingQueue } from '../electron/storage/queueStorage.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('migrates queued historical sale types once before returning them for sync', () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-offline-queue-'));
  tempDirs.push(storageDir);
  const historicalSale = {
    sync_id: 'pending-before-shop-model',
    sale_type: 'branch',
    status: 'PENDING',
    total_amount: 12.5,
  };

  expect(writePendingQueue([historicalSale], storageDir)).toBe(true);
  const queue = readPendingQueue(storageDir);
  const paths = fs.readdirSync(storageDir);
  const persisted = JSON.parse(fs.readFileSync(path.join(storageDir, 'pending_queue.json'), 'utf8'));

  expect(queue[0].sale_type).toBe('retail');
  expect(persisted[0].sale_type).toBe('retail');
  expect(paths).toContain('pending_queue.sha256');
  expect(readPendingQueue(storageDir)[0].sale_type).toBe('retail');
});

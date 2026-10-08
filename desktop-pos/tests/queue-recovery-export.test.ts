import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { exportQueueRecoveryFiles, getStoragePaths } from '../electron/storage/queueStorage.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('rejects a recovery destination whose resolved path is inside queue storage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-queue-export-'));
  tempDirs.push(root);
  const storageDir = path.join(root, 'storage');
  const nestedDestination = path.join(storageDir, 'recovery');
  fs.mkdirSync(nestedDestination, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'pending_queue.json'), '[{"sync_id":"kept"}]');

  expect(() => exportQueueRecoveryFiles(nestedDestination, storageDir)).toThrow(
    'اختر مجلدًا خارج مجلد التخزين المحلي لحفظ نسخة الاسترجاع',
  );
  expect(fs.readFileSync(path.join(storageDir, 'pending_queue.json'), 'utf8')).toBe(
    '[{"sync_id":"kept"}]',
  );
});

it('rejects a symlink or junction that resolves into queue storage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-queue-export-link-'));
  tempDirs.push(root);
  const storageDir = path.join(root, 'storage');
  const internalDestination = path.join(storageDir, 'recovery');
  const linkedDestination = path.join(root, 'selected-folder');
  fs.mkdirSync(internalDestination, { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'pending_queue.json'), '[{"sync_id":"kept"}]');
  fs.symlinkSync(
    internalDestination,
    linkedDestination,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  expect(() => exportQueueRecoveryFiles(linkedDestination, storageDir)).toThrow(
    'اختر مجلدًا خارج مجلد التخزين المحلي لحفظ نسخة الاسترجاع',
  );
  expect(fs.readdirSync(internalDestination)).toEqual([]);
});

it('exports the original queue files and a manifest to an external directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-queue-export-safe-'));
  tempDirs.push(root);
  const storageDir = path.join(root, 'storage');
  const destinationDir = path.join(root, 'recovery-destination');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(destinationDir, { recursive: true });
  const paths = getStoragePaths(storageDir);
  const originalQueue = '[{"sync_id":"legacy-pos-sale","total_amount":125}]';
  fs.writeFileSync(paths.primaryFile, originalQueue, { mode: 0o600 });

  const result = exportQueueRecoveryFiles(destinationDir, storageDir);

  expect(result.fileCount).toBe(1);
  expect(
    fs.readFileSync(path.join(result.directory, path.basename(paths.primaryFile)), 'utf8'),
  ).toBe(originalQueue);
  expect(
    JSON.parse(fs.readFileSync(path.join(result.directory, 'manifest.json'), 'utf8')),
  ).toMatchObject({
    formatVersion: 1,
    files: [{ name: 'pending_queue.json', size: Buffer.byteLength(originalQueue) }],
  });
  expect(fs.readFileSync(paths.primaryFile, 'utf8')).toBe(originalQueue);
});

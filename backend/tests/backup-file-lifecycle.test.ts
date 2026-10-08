import { beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config from '../src/config/index.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';
import {
  buildBackupDownload,
  listBackups,
  downloadBackupPath,
  restoreBackup,
} from '../src/services/backupService.ts';
import { runAutoBackup } from '../src/services/autoBackupService.ts';

const { sendAlert, getCloudConfig, uploadBackupToCloud } = vi.hoisted(() => ({
  sendAlert: vi.fn(),
  getCloudConfig: vi.fn(),
  uploadBackupToCloud: vi.fn(),
}));
vi.mock('../src/services/notificationService.ts', () => ({ sendAlert }));
vi.mock('../src/services/cloudBackupService.ts', () => ({ getCloudConfig, uploadBackupToCloud }));
beforeEach(() => {
  sendAlert.mockReset().mockResolvedValue({
    success: true,
    persisted: true,
    discord: 'disabled',
    telegram: 'disabled',
  });
  getCloudConfig.mockReset().mockResolvedValue(null);
  uploadBackupToCloud.mockReset();
});

assertSafeTestDatabase(config.db);

it('listing, downloading and restoring exclude a directory masquerading as a JSON snapshot', async () => {
  const root = path.join(process.cwd(), 'backups');
  const name = `backup-lifecycle-fixture-${randomUUID()}.json`;
  const fixture = path.join(root, name);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(fixture);
  try {
    expect((await listBackups()).some((entry) => entry.name === name)).toBe(false);
    await expect(downloadBackupPath(name)).rejects.toMatchObject({ statusCode: 404 });
    await expect(restoreBackup(name)).rejects.toMatchObject({ statusCode: 404 });
  } finally {
    // Remove only this empty, exclusively created fixture; preserve operator snapshots.
    await fs.rmdir(fixture);
  }
});

const withAutoStorage = async (operation: (directory: string) => Promise<void>) => {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'erp-backup-lifecycle-'));
  const names = [
    'AUTO_BACKUP_DIR',
    'AUTO_BACKUP_SKIP_CLEANUP',
    'AUTO_BACKUP_SKIP_EXTERNAL',
    'LOCAL_EXTERNAL_BACKUP_PATH',
  ];
  const previous = names.map((name) => process.env[name]);
  process.env.AUTO_BACKUP_DIR = directory;
  process.env.AUTO_BACKUP_SKIP_CLEANUP = '1';
  process.env.AUTO_BACKUP_SKIP_EXTERNAL = '1';
  delete process.env.LOCAL_EXTERNAL_BACKUP_PATH;
  try {
    await operation(directory);
  } finally {
    vi.useRealTimers();
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    const resolved = await fs.realpath(directory);
    expect(path.dirname(resolved)).toBe(parent);
    expect(path.basename(resolved).startsWith('erp-backup-lifecycle-')).toBe(true);
    await fs.rm(resolved, { recursive: true, force: true });
  }
};

it('manual snapshots have independent names even when the clock is identical', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-02T03:04:05.000Z'));
  try {
    const first = await buildBackupDownload();
    const second = await buildBackupDownload();
    expect(second.file).not.toBe(first.file);
  } finally {
    vi.useRealTimers();
  }
});

it('automatic snapshots created in the same second preserve both complete files', async () =>
  withAutoStorage(async (directory) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-02T03:04:05.000Z'));
    await runAutoBackup();
    const firstFiles = await fs.readdir(directory);
    expect(firstFiles).toHaveLength(1);
    const original = await fs.readFile(path.join(directory, firstFiles[0]));
    await runAutoBackup();
    const files = await fs.readdir(directory);
    expect(files).toHaveLength(2);
    expect(await fs.readFile(path.join(directory, firstFiles[0]))).toEqual(original);
  }));

it('automatic storage failures reject so the queue cannot mark a failed backup completed', async () =>
  withAutoStorage(async (directory) => {
    const invalidDirectory = path.join(directory, 'not-a-directory.txt');
    await fs.writeFile(invalidDirectory, 'Fixture sentinel');
    process.env.AUTO_BACKUP_DIR = invalidDirectory;
    await expect(runAutoBackup()).rejects.toThrow();
    expect(await fs.readFile(invalidDirectory, 'utf8')).toBe('Fixture sentinel');
  }));

it('a configured cloud failure preserves the local copy and reports a warning', async () =>
  withAutoStorage(async (directory) => {
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '0';
    getCloudConfig.mockResolvedValue({ provider: 'google_drive' });
    uploadBackupToCloud.mockResolvedValue({ success: false, message: 'Isolated provider failure' });
    const result = await runAutoBackup();
    expect(result).toMatchObject({ status: 'partial', warnings: ['cloud'], cloudUploaded: false });
    expect(sendAlert).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'warning');
    expect(JSON.parse(await fs.readFile(result!.path, 'utf8')).encrypted).toBe(true);
    expect(await fs.readdir(directory)).toHaveLength(1);
  }));

it('a failed external path preserves the local copy and reports a warning', async () =>
  withAutoStorage(async (directory) => {
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '0';
    const sentinel = path.join(directory, 'external-path.txt');
    await fs.writeFile(sentinel, 'Isolated external path sentinel');
    process.env.LOCAL_EXTERNAL_BACKUP_PATH = sentinel;
    const result = await runAutoBackup();
    expect(result).toMatchObject({
      status: 'partial',
      warnings: ['external'],
      externalCopied: false,
    });
    expect(sendAlert).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'warning');
    expect(await fs.readFile(sentinel, 'utf8')).toBe('Isolated external path sentinel');
    expect(JSON.parse(await fs.readFile(result!.path, 'utf8')).encrypted).toBe(true);
  }));

it('notification failure does not invalidate a completed local snapshot', async () =>
  withAutoStorage(async () => {
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '0';
    sendAlert.mockRejectedValue(new Error('Isolated notification failure'));
    const result = await runAutoBackup();
    expect(result).toMatchObject({ status: 'partial', warnings: ['notification'] });
    expect(JSON.parse(await fs.readFile(result.path, 'utf8')).encrypted).toBe(true);
  }));

it('a resolved failed delivery receipt preserves the local snapshot and reports partial completion', async () =>
  withAutoStorage(async () => {
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '0';
    sendAlert.mockResolvedValue({
      success: false,
      persisted: true,
      discord: 'failed',
      telegram: 'disabled',
    });
    const result = await runAutoBackup();
    expect(result).toMatchObject({ status: 'partial', warnings: ['notification'] });
    expect(JSON.parse(await fs.readFile(result.path, 'utf8')).encrypted).toBe(true);
  }));

it('weekly retention uses UTC week boundaries and leaves JSON directories untouched', async () =>
  withAutoStorage(async (directory) => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'Africa/Cairo';
    process.env.AUTO_BACKUP_SKIP_CLEANUP = '0';
    // Two instants straddling Sunday/Monday UTC share Monday in Cairo.
    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1) - 49);
    const dates = [
      new Date(monday.getTime() - 90 * 60000),
      new Date(monday.getTime() + 30 * 60000),
    ];
    const names = ['auto-backup-legacy-sunday.json', 'auto-backup-legacy-monday.json'];
    const maskedDirectory = path.join(directory, 'auto-backup-directory.json');
    await fs.mkdir(maskedDirectory);
    try {
      for (const [index, name] of names.entries()) {
        const file = path.join(directory, name);
        await fs.writeFile(file, '{}');
        await fs.utimes(file, dates[index], dates[index]);
      }
      const result = await runAutoBackup();
      expect(result.status).toBe('complete');
      const remaining = await fs.readdir(directory);
      expect(remaining).toEqual(expect.arrayContaining(names));
      expect(remaining).toHaveLength(4);
      expect((await fs.lstat(maskedDirectory)).isDirectory()).toBe(true);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  }));

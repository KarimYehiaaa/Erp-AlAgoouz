import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const createBackupFileName = (prefix: 'backup' | 'auto-backup', now = new Date()) => {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}-${randomUUID()}.json`;
};

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const ensureBackupDirectory = async (directory: string, fops = fs): Promise<string> => {
  await fops.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fops.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Backup storage must be a regular directory, not a symbolic link.');
  }
  return fops.realpath(directory);
};

/** Legacy snapshot names remain readable; links and directories never become snapshots. */
export const listStoredBackups = async (directory: string, fops = fs) => {
  const root = await ensureBackupDirectory(directory, fops);
  const names = (await fops.readdir(root)).filter((name) => name.endsWith('.json'));
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const stat = await fops.lstat(path.join(root, name));
        if (!stat.isFile() || stat.isSymbolicLink()) return null;
        return { name, size: stat.size, mtime: stat.mtime };
      } catch (error: unknown) {
        // A retention job can remove a snapshot between readdir and lstat.
        if (isMissing(error)) return null;
        throw error;
      }
    }),
  );
  return entries
    .filter((entry) => entry !== null)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
};

export const resolveStoredBackup = async (directory: string, name: string) => {
  if (!name || path.basename(name) !== name || name.includes('..') || !name.endsWith('.json')) {
    throw new Error('Invalid backup file name.');
  }
  const root = await ensureBackupDirectory(directory);
  const target = path.join(root, name);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Backup snapshot must be a regular file.');
  }
  return target;
};

const requireEncryptedEnvelope = (content: string) => {
  let envelope: { encrypted?: unknown; payload?: unknown };
  try {
    envelope = JSON.parse(content);
  } catch {
    throw new Error('Only a valid encrypted JSON snapshot may be stored.');
  }
  if (
    !envelope ||
    envelope.encrypted !== true ||
    typeof envelope.payload !== 'string' ||
    !/^[0-9a-f]{24}:[0-9a-f]{32}:(?:[0-9a-f]{2})+$/i.test(envelope.payload)
  ) {
    throw new Error('Only a valid encrypted JSON snapshot may be stored.');
  }
};

/** Publish only a fully written snapshot; the exclusive staging directory serializes equal names. */
export const persistEncryptedBackup = async (
  directory: string,
  name: string,
  content: string,
  deps: { fs?: typeof fs } = {},
) => {
  if (!/^(?:auto-)?backup-[a-zA-Z0-9_-]+\.json$/.test(name)) {
    throw new Error('Invalid new backup file name.');
  }
  requireEncryptedEnvelope(content);
  const fops = deps.fs || fs;
  const root = await ensureBackupDirectory(directory, fops);
  const target = path.join(root, name);
  const stage = path.join(root, '.pending-' + name + '.writing');
  // Exclusive mkdir works on ordinary Windows/Linux volumes without requiring hard links.
  await fops.mkdir(stage, { mode: 0o700 });
  const temporary = path.join(stage, 'payload.tmp');
  const errors: unknown[] = [];
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let ownsTemporary = false;
  try {
    let exists = false;
    try {
      await fops.lstat(target);
      exists = true;
    } catch (error: unknown) {
      if (!isMissing(error)) throw error;
    }
    if (exists) throw new Error('Refusing to overwrite an existing backup.');
    handle = await fops.open(temporary, 'wx', 0o600);
    ownsTemporary = true;
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch (error: unknown) {
    errors.push(error);
  }
  if (handle) {
    try {
      await handle.close();
    } catch (error: unknown) {
      errors.push(error);
    }
  }
  if (!errors.length) {
    try {
      await fops.rename(temporary, target);
      ownsTemporary = false;
    } catch (error: unknown) {
      errors.push(error);
    }
  }
  try {
    const stat = await fops.lstat(stage);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Refusing cleanup of a replaced backup staging directory.');
    }
    if (ownsTemporary) await fops.unlink(temporary);
    // Never recursively delete a staging directory containing unexpected files.
    await fops.rmdir(stage);
  } catch (error: unknown) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Backup publication or cleanup failed.');
  return { file: name, path: target };
};

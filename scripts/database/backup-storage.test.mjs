import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  persistEncryptedBackup,
  listStoredBackups,
  resolveStoredBackup,
} from '../../backend/src/utils/backupStorage.ts';

const key = crypto.scryptSync(
  'Isolated-backup-storage-fixture-key-never-deploy',
  'salt_al_ajouz_v2',
  32,
);
const rows = {
  meta: { fixture: true },
  data: { products: [{ name_ar: 'بن اختبار', sale_price: 50 }] },
};
const encrypted = () => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(rows)), cipher.final()]);
  return JSON.stringify({
    encrypted: true,
    payload: [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      content.toString('hex'),
    ].join(':'),
  });
};
const decode = (content) => {
  const [iv, tag, data] = JSON.parse(content).payload.split(':');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString(),
  );
};
const withFixture = async (operation) => {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'erp-backup-storage-'));
  try {
    await operation(directory);
  } finally {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('erp-backup-storage-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
};
const fileName = 'backup-isolated-storage.json';

test('real filesystem publication retains decryptable bytes and removes its staging directory', async () =>
  withFixture(async (directory) => {
    const content = encrypted();
    const result = await persistEncryptedBackup(directory, fileName, content);
    assert.equal(await fs.readFile(result.path, 'utf8'), content);
    assert.deepEqual(decode(content), rows);
    assert.deepEqual(await fs.readdir(directory), [fileName]);
    if (process.platform !== 'win32')
      assert.equal((await fs.stat(result.path)).mode & 0o777, 0o600);
  }));

test('a second publication never replaces the previous complete snapshot', async () =>
  withFixture(async (directory) => {
    const original = encrypted();
    await persistEncryptedBackup(directory, fileName, original);
    await assert.rejects(
      persistEncryptedBackup(directory, fileName, encrypted()),
      /overwrite an existing backup/,
    );
    assert.equal(await fs.readFile(path.join(directory, fileName), 'utf8'), original);
    assert.deepEqual(await fs.readdir(directory), [fileName]);
  }));

test('concurrent equal-name publishers produce one complete file without damaging the winner', async () =>
  withFixture(async (directory) => {
    const candidates = [encrypted(), encrypted()];
    const result = await Promise.allSettled(
      candidates.map((content) => persistEncryptedBackup(directory, fileName, content)),
    );
    assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(result.filter((item) => item.status === 'rejected').length, 1);
    const content = await fs.readFile(path.join(directory, fileName), 'utf8');
    assert.ok(candidates.includes(content));
    assert.deepEqual(decode(content), rows);
    assert.deepEqual(await fs.readdir(directory), [fileName]);
  }));

test('an actual partial write followed by failure leaves no published or staging artifact', async () =>
  withFixture(async (directory) => {
    const fops = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (content) => {
          await write(content.slice(0, 20));
          throw new Error('Isolated storage write failure');
        };
        return handle;
      },
    };
    await assert.rejects(
      persistEncryptedBackup(directory, fileName, encrypted(), { fs: fops }),
      /Isolated storage write failure/,
    );
    assert.deepEqual(await fs.readdir(directory), []);
  }));

test(
  'readers cannot see a half-written snapshot while the publisher is paused',
  { timeout: 15000 },
  async () =>
    withFixture(async (directory) => {
      let release;
      let halfWritten;
      const pause = new Promise((resolve) => {
        release = resolve;
      });
      const written = new Promise((resolve) => {
        halfWritten = resolve;
      });
      const fops = {
        ...fs,
        open: async (...args) => {
          const handle = await fs.open(...args);
          const write = handle.writeFile.bind(handle);
          handle.writeFile = async (content) => {
            const half = Math.floor(content.length / 2);
            await write(content.slice(0, half));
            halfWritten();
            await pause;
            await write(content.slice(half));
          };
          return handle;
        },
      };
      const content = encrypted();
      const pending = persistEncryptedBackup(directory, fileName, content, { fs: fops });
      await written;
      let result;
      try {
        assert.deepEqual(
          (await fs.readdir(directory)).filter((name) => name.endsWith('.json')),
          [],
        );
      } finally {
        release();
        result = await pending;
      }
      assert.equal(await fs.readFile(result.path, 'utf8'), content);
      assert.deepEqual(decode(content), rows);
    }),
);

test('plaintext or truncated content is rejected before creating a directory', async () =>
  withFixture(async (directory) => {
    const target = path.join(directory, 'uncreated');
    for (const content of [JSON.stringify(rows), 'PRIVATE_INVALID_JSON_SENTINEL', 'null']) {
      await assert.rejects(
        persistEncryptedBackup(target, fileName, content),
        /valid encrypted JSON/,
      );
    }
    assert.deepEqual(await fs.readdir(directory), []);
  }));

test('a configured directory junction cannot publish data into another directory', async () =>
  withFixture(async (directory) => {
    const external = path.join(directory, 'external');
    const alias = path.join(directory, 'alias');
    await fs.mkdir(external);
    await fs.symlink(external, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(persistEncryptedBackup(alias, fileName, encrypted()), /regular directory/);
    assert.deepEqual(await fs.readdir(external), []);
  }));

test('snapshot readers exclude JSON directories and junctions but retain legacy file names', async () =>
  withFixture(async (directory) => {
    const root = path.join(directory, 'snapshots');
    const external = path.join(directory, 'external');
    await fs.mkdir(root);
    await fs.mkdir(external);
    await fs.writeFile(path.join(root, 'backup-legacy.json'), encrypted());
    await fs.mkdir(path.join(root, 'directory.json'));
    await fs.symlink(
      external,
      path.join(root, 'alias.json'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.deepEqual(
      (await listStoredBackups(root)).map((file) => file.name),
      ['backup-legacy.json'],
    );
    assert.equal(
      await resolveStoredBackup(root, 'backup-legacy.json'),
      path.join(root, 'backup-legacy.json'),
    );
    for (const name of ['directory.json', 'alias.json']) {
      await assert.rejects(resolveStoredBackup(root, name), /regular file/);
    }
    await assert.rejects(resolveStoredBackup(root, '../escape.json'), /Invalid backup file/);
    assert.deepEqual(await fs.readdir(external), []);
  }));

test('listing tolerates a snapshot removed concurrently by retention', async () =>
  withFixture(async (directory) => {
    await fs.writeFile(path.join(directory, 'backup-removed.json'), encrypted());
    const fops = {
      ...fs,
      lstat: async (target) => {
        if (path.basename(target) === 'backup-removed.json') await fs.unlink(target);
        return fs.lstat(target);
      },
    };
    assert.deepEqual(await listStoredBackups(directory, fops), []);
  }));

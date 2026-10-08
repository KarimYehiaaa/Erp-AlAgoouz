import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBackup, buildArchiveName } from './backup-system.ts';

const secret = 'Isolated-system-archive-encryption-key-never-deploy';
const key = crypto.scryptSync(secret, 'salt_al_ajouz_v2', 32);
const originalData = {
  meta: { fixture: true },
  data: { products: [{ name_ar: 'بن تجريبي', sale_price: 120 }] },
};
const snapshotName = 'backup-isolated-fixture.json';
const encryptFixture = () => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(originalData)), cipher.final()]);
  return JSON.stringify({
    encrypted: true,
    payload: [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      ciphertext.toString('hex'),
    ].join(':'),
  });
};
const decryptFixture = (content) => {
  const [iv, tag, ciphertext] = JSON.parse(content).payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString(),
  );
};

const withFixture = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp backup fixture-'));
  const messages = [];
  const write = (relative, content) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const snapshot = () => {
    write('backend/backups/' + snapshotName, encryptFixture());
    return { file: snapshotName, path: path.join(root, 'backend', 'backups', snapshotName) };
  };
  write('package.json', JSON.stringify({ scripts: { build: 'npm run build:local -w frontend' } }));
  write('frontend/package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
  write('frontend/vite.config.js', 'export default {};');
  write('backend/src/new-uncommitted.txt', 'Latest uncommitted shop source & values');
  const options = {
    rootDir: root,
    exportDatabase: snapshot,
    log: (message) => messages.push(message),
  };
  const artifacts = () =>
    fs.existsSync(path.join(root, 'full-backups'))
      ? fs.readdirSync(path.join(root, 'full-backups'))
      : [];
  try {
    callback({ root, write, snapshot, messages, options, artifacts });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
const extract = (archive, destination) => {
  fs.mkdirSync(destination, { recursive: true });
  const cwd = path.dirname(archive);
  execFileSync('tar', ['-xzf', path.basename(archive), '-C', destination], {
    cwd,
    stdio: 'pipe',
    windowsHide: true,
  });
};

test('real tar archive retains the fresh encrypted database, current source and uploads; excludes secrets and caches', () =>
  withFixture((state) => {
    for (const relative of [
      '.env',
      'backend/.env.production',
      'uploads/.ENV.PRIVATE',
      'backend/.postgres.local',
      'frontend/android/local.properties',
      'frontend/android/app/private.keystore',
      'backend/certs/key.pem',
      'scratch/temporary.txt',
      'node_modules/cache.txt',
      'backend/backups/backup-old.json',
      'frontend/dist/index.html',
      'frontend/dist-native/index.html',
      'desktop-pos/release/old.exe',
      '.vercel/output/static/index.html',
    ])
      state.write(relative, 'PRIVATE_OR_GENERATED_SENTINEL');
    for (const runtime of ['analytics-service/tmpabcd123', 'analytics-service/custom-runtime']) {
      state.write(`${runtime}/pyvenv.cfg`, 'home = C:/machine-specific/python');
      state.write(
        `${runtime}/Lib/site-packages/installed-package.py`,
        'PRIVATE_OR_GENERATED_SENTINEL',
      );
    }
    state.write(
      'analytics-service/tmp-business-notes/source.py',
      'Required source with a tmp prefix',
    );
    state.write('.env.example', 'DB_HOST=localhost');
    state.write('backend/certs/public.crt', 'Public CA fixture');
    state.write('uploads/receipt & coffee.jpg', 'Required upload fixture');
    state.write('backend/src/notes & values.txt', 'Source with shell characters');
    const result = runBackup(state.options);
    const output = path.join(state.root, 'extracted');
    extract(result.archivePath, output);
    const database = fs.readFileSync(path.join(output, 'database', snapshotName), 'utf8');
    assert.deepEqual(decryptFixture(database), originalData);
    assert.equal(
      fs.readFileSync(
        path.join(output, 'project', 'backend', 'src', 'new-uncommitted.txt'),
        'utf8',
      ),
      'Latest uncommitted shop source & values',
    );
    assert.equal(
      fs.readFileSync(path.join(output, 'project', 'uploads', 'receipt & coffee.jpg'), 'utf8'),
      'Required upload fixture',
    );
    assert.ok(fs.existsSync(path.join(output, 'project', '.env.example')));
    assert.ok(fs.existsSync(path.join(output, 'project', 'backend', 'certs', 'public.crt')));
    assert.ok(
      fs.existsSync(
        path.join(output, 'project', 'analytics-service', 'tmp-business-notes', 'source.py'),
      ),
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.database.path, 'database/' + snapshotName);
    assert.equal(
      manifest.database.sha256,
      crypto.createHash('sha256').update(database).digest('hex'),
    );
    for (const file of manifest.projectFiles) {
      const content = fs.readFileSync(path.join(output, ...file.path.split('/')));
      assert.equal(content.length, file.size);
      assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256);
      assert.ok(!content.includes('PRIVATE_OR_GENERATED_SENTINEL'), file.path);
    }
    assert.match(
      fs.readFileSync(path.join(output, 'RESTORE.md'), 'utf8'),
      /original BACKUP_ENCRYPTION_KEY/,
    );
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(result.archivePath)).digest('hex'),
      result.sha256,
    );
    assert.deepEqual(state.artifacts(), [path.basename(result.archivePath)]);
  }));

test('failed database export stops before archiving and does not announce success', () =>
  withFixture((state) => {
    assert.throws(
      () =>
        runBackup({
          ...state.options,
          exportDatabase: () => {
            throw new Error('Isolated export failure');
          },
        }),
      /Database export failed/,
    );
    assert.deepEqual(state.artifacts(), []);
    assert.ok(!state.messages.some((message) => message.startsWith('SUCCESS:')));
  }));

for (const [description, mutate, expected] of [
  [
    'plaintext snapshot',
    (state) => state.write('backend/backups/' + snapshotName, JSON.stringify(originalData)),
    /encrypted backup envelope/,
  ],
  [
    'null snapshot',
    (state) => state.write('backend/backups/' + snapshotName, 'null'),
    /encrypted backup envelope/,
  ],
  [
    'truncated JSON snapshot',
    (state) =>
      state.write(
        'backend/backups/' + snapshotName,
        'private content that must not appear in the error',
      ),
    /not readable encrypted JSON/,
  ],
])
  test(`rejects a ${description} without publishing an archive`, () =>
    withFixture((state) => {
      const snapshot = state.snapshot();
      mutate(state);
      assert.throws(
        () => runBackup({ ...state.options, exportDatabase: () => snapshot }),
        expected,
      );
      assert.deepEqual(state.artifacts(), []);
    }));

test('tar failure keeps the database snapshot, removes partial artifacts and never falls back to git HEAD', () =>
  withFixture((state) => {
    const commands = [];
    assert.throws(
      () =>
        runBackup({
          ...state.options,
          execFileSync: (command, args) => {
            commands.push(command);
            assert.ok(
              !path.isAbsolute(args[1]),
              'archive path must be relative for GNU tar on Windows',
            );
            throw new Error('Isolated tar failure');
          },
        }),
      /Isolated tar failure/,
    );
    assert.deepEqual(commands, ['tar']);
    assert.deepEqual(state.artifacts(), []);
    assert.ok(fs.existsSync(path.join(state.root, 'backend', 'backups', snapshotName)));
    assert.ok(!state.messages.some((message) => message.startsWith('SUCCESS:')));
  }));

test('byte corruption after extraction prevents publication and is detected by the source hash', () =>
  withFixture((state) => {
    const execute = (command, args, options) => {
      const output = execFileSync(command, args, { ...options, stdio: 'pipe' });
      if (args[0] === '-xzf') {
        const verify = path.resolve(options.cwd, args[args.indexOf('-C') + 1]);
        fs.writeFileSync(
          path.join(verify, 'project', 'backend', 'src', 'new-uncommitted.txt'),
          'CORRUPTED',
        );
      }
      return output;
    };
    assert.throws(
      () => runBackup({ ...state.options, execFileSync: execute }),
      /integrity verification/,
    );
    assert.deepEqual(state.artifacts(), []);
    assert.ok(!state.messages.some((message) => message.startsWith('SUCCESS:')));
  }));

test('the same timestamp produces separate verified archives without overwriting the first', () =>
  withFixture((state) => {
    const options = { ...state.options, now: new Date('2026-10-04T00:00:00Z') };
    const first = runBackup(options);
    const before = fs.readFileSync(first.archivePath);
    const second = runBackup(options);
    assert.notEqual(first.archivePath, second.archivePath);
    assert.deepEqual(fs.readFileSync(first.archivePath), before);
    assert.equal(state.artifacts().length, 2);
  }));

test('export protocol tolerates logger output but requires exactly one snapshot result', () =>
  withFixture((state) => {
    const execute = (command, args, options) => {
      if (command === process.execPath) {
        assert.equal(options.cwd, path.join(state.root, 'backend'));
        state.snapshot();
        return '[logger] initialized\nSUCCESS:' + snapshotName + '\n[logger] pool closed\n';
      }
      return execFileSync(command, args, { ...options, stdio: 'pipe' });
    };
    const options = { ...state.options };
    delete options.exportDatabase;
    const result = runBackup({ ...options, execFileSync: execute });
    assert.ok(fs.existsSync(result.archivePath));
    assert.throws(
      () =>
        runBackup({
          ...options,
          execFileSync: () => 'SUCCESS:' + snapshotName + '\nSUCCESS:' + snapshotName,
        }),
      /Database export failed/,
    );
    assert.equal(state.artifacts().length, 1);
  }));

test('an external backup destination junction is rejected before exporting or touching its target', () =>
  withFixture((state) => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-external-backup-fixture-'));
    try {
      fs.symlinkSync(
        external,
        path.join(state.root, 'full-backups'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      let called = false;
      assert.throws(
        () =>
          runBackup({
            ...state.options,
            exportDatabase: () => {
              called = true;
              return state.snapshot();
            },
          }),
        /regular directories inside the project/,
      );
      assert.equal(called, false);
      assert.deepEqual(fs.readdirSync(external), []);
    } finally {
      fs.rmSync(path.join(state.root, 'full-backups'), { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  }));

test('source symlinks cannot smuggle files from outside the project into an archive', () =>
  withFixture((state) => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-external-source-fixture-'));
    try {
      fs.writeFileSync(path.join(external, 'private.txt'), 'EXTERNAL_PRIVATE_SENTINEL');
      fs.symlinkSync(
        external,
        path.join(state.root, 'backend', 'external-data'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      assert.throws(() => runBackup(state.options), /refuses symbolic links/);
      assert.deepEqual(state.artifacts(), []);
      assert.equal(
        fs.readFileSync(path.join(external, 'private.txt'), 'utf8'),
        'EXTERNAL_PRIVATE_SENTINEL',
      );
    } finally {
      fs.rmSync(path.join(state.root, 'backend', 'external-data'), {
        recursive: true,
        force: true,
      });
      fs.rmSync(external, { recursive: true, force: true });
    }
  }));

test('archive names have no drive syntax or shell-sensitive timestamp separators', () => {
  assert.match(
    buildArchiveName(new Date('2026-10-04T01:02:03Z')),
    /^AlAgoouz-ERP-Full-Backup-2026-10-04_01-02-03$/,
  );
});

for (const [description, args] of [
  [
    'manual backup refuses a missing encryption key before accessing any database',
    ['scripts/run-backup-cli.ts'],
  ],
  [
    'application encryption refuses the predictable development key when configuration is missing',
    [
      '--input-type=module',
      '-e',
      "const { encrypt } = await import('./src/utils/crypto.ts'); encrypt('Isolated fixture');",
    ],
  ],
])
  test(description, () => {
    const backend = new URL('../../backend/', import.meta.url);
    const result = spawnSync(process.execPath, args, {
      cwd: backend,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: '',
        DB_HOST: '127.0.0.1',
        DB_PORT: '1',
        DB_NAME: 'isolated_backup_guard_test',
        DB_USER: 'isolated-fixture-user',
        DB_PASSWORD: 'isolated-fixture-password',
        DB_SSL: 'false',
        DB_SSL_CA_FILE: '',
        BACKUP_ENCRYPTION_KEY: '',
        JWT_SECRET: 'Isolated-backup-guard-JWT-secret-not-for-deployment',
        JWT_REFRESH_SECRET: 'Isolated-backup-guard-refresh-secret-not-for-deployment',
        VERCEL: '',
        VERCEL_ENV: '',
        VERCEL_URL: '',
        SENTRY_DSN: '',
        SUPPRESS_CONFIG_LOG: '1',
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /BACKUP_ENCRYPTION_KEY must contain at least 32 characters/);
    assert.ok(!result.stdout.includes('SUCCESS:'));
    assert.ok(!result.stderr.includes('ECONNREFUSED'), result.stderr);
  });

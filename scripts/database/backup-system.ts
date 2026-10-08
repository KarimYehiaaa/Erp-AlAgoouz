/** Source + uploads + one fresh encrypted database snapshot, verified before publication. */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkBuildPath } from '../maintenance/lib/checkBuildPath.ts';

type DatabaseBackup = { file: string; path: string };
type BackupFile = { path: string; size: number; sha256: string };
export interface BackupDeps {
  rootDir?: string;
  exportDatabase?: (backendDir: string) => DatabaseBackup;
  execFileSync?: typeof execFileSync;
  log?: (message: string) => void;
  now?: Date;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const excludedDirectories = new Set([
  'node_modules',
  '.git',
  '.vercel',
  '.freebuff',
  '.zcode',
  '.kiro',
  '.vscode',
  '.gradle',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'coverage',
  '.nyc_output',
  'test-results',
  'playwright-report',
  '.playwright-dist',
  'dist',
  'dist-electron',
  'release',
  'backups',
  'full-backups',
  'logs',
  'scratch',
  'tmp',
  'temp-e2e',
  'temp-npm-cache',
  '.codex-npm-cache',
  '.codex-gradle-cache',
  '.uv-cache',
  '.uv-tools',
  'node-compile-cache',
  'signing-private',
]);

const excludedSource = (relative: string, directory: boolean): boolean => {
  const parts = relative.split('/');
  const name = parts.at(-1)!;
  const lowerName = name.toLowerCase();
  if (parts.some((part) => excludedDirectories.has(part.toLowerCase()))) return true;
  if (directory && relative.toLowerCase() === 'frontend/dist-native') return true;
  if (
    directory &&
    /^(?:pip-|tsx-|csp-build-|release-codex-|\.codex-(?:build|esbuild)-temp-)/i.test(name)
  )
    return true;
  if (
    relative.toLowerCase().startsWith('frontend/android/') &&
    (parts.some((part) => part.toLowerCase() === 'build') ||
      relative.toLowerCase().startsWith('frontend/android/app/src/main/assets/public'))
  )
    return true;
  return (
    (/^\.env(?:$|\.)/i.test(name) && lowerName !== '.env.example') ||
    ['.postgres.local', 'local.properties'].includes(lowerName) ||
    /\.(?:pem|key|p12|pfx|jks|keystore|apk|aab|exe|blockmap|log|pyc|pyo|tsbuildinfo|recovered)$/i.test(
      name,
    ) ||
    /(?:\.tmp\.js|^\.tmp-.*\.vue|vite\.config\..*timestamp-.*\.mjs)$/.test(name)
  );
};

const inside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return (
    Boolean(relative) &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};

const hashFile = (file: string): string => {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  const descriptor = fs.openSync(file, 'r');
  try {
    let bytes: number;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
};

const fileRecord = (file: string, relative: string): BackupFile => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || (stat.size === 0 && relative.startsWith('database/'))) {
    throw new Error('Backup contains a missing, empty or non-regular database file.');
  }
  return { path: relative, size: stat.size, sha256: hashFile(file) };
};

const copyProject = (root: string, destination: string): BackupFile[] => {
  const files: BackupFile[] = [];
  const visit = (relative: string) => {
    const source = path.join(root, ...relative.split('/').filter(Boolean));
    for (const entry of fs
      .readdirSync(source, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const next = relative ? relative + '/' + entry.name : entry.name;
      if (excludedSource(next, entry.isDirectory())) continue;
      const sourceFile = path.join(root, ...next.split('/'));
      const stat = fs.lstatSync(sourceFile);
      if (stat.isSymbolicLink())
        throw new Error('Portable system backup refuses symbolic links: ' + next);
      const target = path.join(destination, ...next.split('/'));
      if (stat.isDirectory()) {
        // Python's temporary venv names are random; their runtime marker is stable.
        const pythonRuntimeMarker = path.join(sourceFile, 'pyvenv.cfg');
        if (fs.existsSync(pythonRuntimeMarker) && fs.lstatSync(pythonRuntimeMarker).isFile())
          continue;
        fs.mkdirSync(target, { recursive: true });
        visit(next);
      } else if (stat.isFile()) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(sourceFile, target, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(target, stat.mode & 0o777);
        files.push(fileRecord(target, 'project/' + next));
      } else {
        throw new Error('Unsupported source file type: ' + next);
      }
    }
  };
  fs.mkdirSync(destination);
  visit('');
  return files;
};

export function buildArchiveName(now: Date = new Date()): string {
  return (
    'AlAgoouz-ERP-Full-Backup-' +
    now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')
  );
}

const restorationGuide = (file: string) => `# Restoring this system backup

This archive contains project/ (current source and uploads), database/${file}
(the fresh encrypted application snapshot), and manifest.json (SHA-256 hashes).

1. Keep the original BACKUP_ENCRYPTION_KEY securely. It is deliberately absent
   from this archive. A different key cannot decrypt the database snapshot.
2. Copy project/ to the new machine and install Node.js 24 and PostgreSQL.
3. Create .env from .env.example, configure the destination database and restore
   the original BACKUP_ENCRYPTION_KEY through your secret manager. Set new JWT
   secrets. Never commit live credentials.
4. Run npm ci and npm ci --prefix desktop-pos, then npm run setup-db -w backend.
   A shared database upgrade still requires the existing maintenance approval.
5. Start the API and use the administrator's backup restore page to upload
   database/${file}. Test restoration on an isolated database first.
6. Source builds, dependencies, Android SDK/signing keys and installed POS
   profiles/unsynced queues are not included. Build from source; transfer private
   signing material and device queues using their secure backup procedures.
`;

export function runBackup(deps: BackupDeps = {}) {
  const root = fs.realpathSync(path.resolve(deps.rootDir || projectRoot));
  const run = deps.execFileSync || execFileSync;
  const log = deps.log || console.log;
  const buildPath = checkBuildPath(root, { fops: fs });
  if (buildPath.errors.length)
    throw new Error('Build configuration is invalid: ' + buildPath.errors.join('; '));
  buildPath.warnings.forEach((message) => log(message));
  const backend = path.join(root, 'backend');
  const destination = path.join(root, 'full-backups');
  for (const directory of [backend, path.join(backend, 'backups'), destination]) {
    if (
      fs.existsSync(directory) &&
      (fs.lstatSync(directory).isSymbolicLink() || !inside(root, fs.realpathSync(directory)))
    ) {
      throw new Error('Backup directories must be regular directories inside the project.');
    }
  }
  const exportDatabase =
    deps.exportDatabase ||
    ((cwd: string): DatabaseBackup => {
      const output = run(process.execPath, ['scripts/run-backup-cli.ts'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      const results = String(output)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('SUCCESS:'));
      if (results.length !== 1)
        throw new Error('Database export did not return exactly one successful snapshot.');
      const file = results[0].slice('SUCCESS:'.length);
      return { file, path: path.join(cwd, 'backups', file) };
    });
  log('Exporting a fresh encrypted database snapshot...');
  let snapshot: DatabaseBackup;
  try {
    snapshot = exportDatabase(backend);
  } catch {
    throw new Error('Database export failed; no system archive was created.');
  }
  if (
    !/^backup-[a-zA-Z0-9_-]+\.json$/.test(snapshot.file) ||
    path.resolve(snapshot.path) !== path.join(backend, 'backups', snapshot.file)
  ) {
    throw new Error('Database export returned an invalid snapshot path.');
  }
  if (!inside(root, fs.realpathSync(snapshot.path)) || !fs.lstatSync(snapshot.path).isFile()) {
    throw new Error('The fresh database snapshot must be a regular file inside backend/backups.');
  }
  let encrypted: { encrypted?: unknown; payload?: unknown };
  try {
    encrypted = JSON.parse(fs.readFileSync(snapshot.path, 'utf8'));
  } catch {
    throw new Error('Database export is not readable encrypted JSON.');
  }
  if (
    !encrypted ||
    encrypted.encrypted !== true ||
    typeof encrypted.payload !== 'string' ||
    !/^[0-9a-f]{24}:[0-9a-f]{32}:(?:[0-9a-f]{2})+$/i.test(encrypted.payload)
  ) {
    throw new Error('Database export is not a valid encrypted backup envelope.');
  }

  fs.mkdirSync(destination, { recursive: true });
  const destinationReal = fs.realpathSync(destination);
  if (!inside(root, destinationReal)) throw new Error('Backup destination is outside the project.');
  const stage = fs.mkdtempSync(path.join(destination, '.stage-'));
  const archiveName = buildArchiveName(deps.now) + '-' + randomUUID();
  const archivePath = path.join(destination, archiveName + '.tar.gz');
  const partial = path.join(destination, '.' + archiveName + '.partial.tar.gz');
  const partialRelative = path.relative(root, partial);
  let ownsPartial = false;
  let failure: { error: unknown } | undefined;
  let result: {
    archivePath: string;
    archiveName: string;
    databaseFile: string;
    sha256: string;
    size: number;
  };
  try {
    const sourceFiles = copyProject(root, path.join(stage, 'project'));
    fs.mkdirSync(path.join(stage, 'database'));
    const databaseRelative = 'database/' + snapshot.file;
    const databasePath = path.join(stage, 'database', snapshot.file);
    fs.copyFileSync(snapshot.path, databasePath, fs.constants.COPYFILE_EXCL);
    const databaseFile = fileRecord(databasePath, databaseRelative);
    const manifest = {
      format: 'alagoouz-system-backup-v1',
      createdAt: (deps.now || new Date()).toISOString(),
      database: { ...databaseFile, encrypted: true },
      projectFiles: sourceFiles,
      requiredSecret:
        'Original BACKUP_ENCRYPTION_KEY, recovered separately through your secret manager',
    };
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(stage, 'RESTORE.md'), restorationGuide(snapshot.file));
    const records = [
      ...sourceFiles,
      databaseFile,
      fileRecord(path.join(stage, 'manifest.json'), 'manifest.json'),
      fileRecord(path.join(stage, 'RESTORE.md'), 'RESTORE.md'),
    ];
    fs.writeFileSync(partial, '', { flag: 'wx', mode: 0o600 });
    ownsPartial = true;
    const stageRelative = path.relative(root, stage);
    log('Archiving current source, uploads and the fresh database snapshot...');
    run(
      'tar',
      [
        '-czf',
        partialRelative,
        '-C',
        stageRelative,
        'project',
        'database',
        'manifest.json',
        'RESTORE.md',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    const verify = path.join(stage, '.verify');
    fs.mkdirSync(verify);
    run('tar', ['-xzf', partialRelative, '-C', path.relative(root, verify)], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    for (const record of records) {
      const file = path.join(verify, ...record.path.split('/'));
      const verified = fileRecord(file, record.path);
      if (verified.size !== record.size || verified.sha256 !== record.sha256) {
        throw new Error('Extracted archive failed integrity verification: ' + record.path);
      }
    }
    const size = fs.statSync(partial).size;
    if (size === 0) throw new Error('The system archive is empty.');
    const sha256 = hashFile(partial);
    if (fs.existsSync(archivePath))
      throw new Error('Refusing to overwrite an existing system backup.');
    fs.renameSync(partial, archivePath);
    ownsPartial = false;
    result = { archivePath, archiveName, databaseFile: snapshot.file, sha256, size };
  } catch (error: unknown) {
    failure = { error };
  }
  try {
    // Only remove this invocation's staging directory, after resolving its bounds.
    if (
      inside(destinationReal, fs.realpathSync(stage)) &&
      path.basename(stage).startsWith('.stage-')
    ) {
      fs.rmSync(stage, { recursive: true, force: true });
    } else {
      throw new Error('Refusing cleanup of a staging directory outside the backup destination.');
    }
    if (ownsPartial && fs.existsSync(partial)) fs.unlinkSync(partial);
  } catch (cleanupError: unknown) {
    if (failure) {
      throw new AggregateError(
        [failure.error, cleanupError],
        'System backup failed and temporary-file cleanup needs attention.',
        { cause: cleanupError },
      );
    }
    throw cleanupError;
  }
  if (failure) throw failure.error;
  log('SUCCESS: Verified full system backup: ' + result.archivePath);
  log('SHA-256: ' + result.sha256);
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runBackup();
  } catch (error: unknown) {
    console.error(
      'System backup failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exitCode = 1;
  }
}

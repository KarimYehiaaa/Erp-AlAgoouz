import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Evaluate real Compose interpolation with synthetic credentials. Never print
// `docker compose config` for the live .env: its output contains plaintext secrets.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = await fs.mkdtemp(path.join(root, 'scratch', 'docker-config-'));
const fixture = {
  PORT: '3017',
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_NAME: 'fixture_test',
  DB_USER: 'fixture_user',
  DB_PASSWORD: 'fictional-database-password',
  DB_SSL: 'false',
  DB_POOL_MODE: 'auto',
  DB_POOL_MAX: '3',
  DB_MAINTENANCE_POOL_MAX: '3',
  JWT_SECRET: 'fictional-access-key-for-container-verification-2026',
  JWT_REFRESH_SECRET: 'fictional-refresh-key-for-container-verification-2026',
  BACKUP_ENCRYPTION_KEY: 'fictional-backup-key-for-container-verification-2026',
  CORS_ORIGIN: 'http://localhost:3017,https://agoouz.vercel.app',
};
let failures = 0;
const check = (label, test) => {
  try {
    test();
    console.log(`PASS ${label}`);
  } catch {
    failures++;
    console.log(`FAIL ${label}`);
  }
};
const docker = (args, env = {}) =>
  execFileSync('docker', args, {
    cwd: root,
    env: { ...process.env, ...fixture, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
let tag;
try {
  const envFile = path.join(work, 'fixture.env');
  await fs.writeFile(
    envFile,
    Object.entries(fixture)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  for (const [mode, DATABASE_URL] of [
    ['local', ''],
    [
      'shared',
      'postgresql://fixture_user:fictional-password@fixture.pooler.supabase.com:6543/postgres',
    ],
  ]) {
    const config = JSON.parse(
      docker(
        [
          'compose',
          '--profile',
          'local-db',
          '--project-name',
          'codex-config-verification',
          '--env-file',
          envFile,
          '-f',
          path.join(root, 'docker-compose.yml'),
          'config',
          '--format',
          'json',
        ],
        { DATABASE_URL },
      ),
    );
    const api = config.services.backend;
    check(`${mode}: database selection`, () =>
      assert.equal(api.environment.DATABASE_URL, DATABASE_URL),
    );
    for (const key of [
      'BACKUP_ENCRYPTION_KEY',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'DB_POOL_MODE',
      'DB_POOL_MAX',
      'DB_MAINTENANCE_POOL_MAX',
      'CORS_ORIGIN',
    ]) {
      check(`${mode}: ${key} forwarded`, () => assert.equal(api.environment[key], fixture[key]));
    }
    check(`${mode}: production`, () => assert.equal(api.environment.NODE_ENV, 'production'));
    check(`${mode}: port matches server`, () =>
      assert(
        api.ports.some(
          (p) => p.host_ip === '127.0.0.1' && p.target === 3017 && p.published === '3017',
        ),
      ),
    );
    check(`${mode}: backups persisted`, () =>
      assert(api.volumes?.some((v) => v.type === 'volume' && v.target === '/app/backend/backups')),
    );
    check(`${mode}: logs persisted`, () =>
      assert(api.volumes?.some((v) => v.type === 'volume' && v.target === '/app/backend/logs')),
    );
    check(`${mode}: PostgreSQL loopback binding`, () =>
      assert(config.services.postgres.ports.every((p) => p.host_ip === '127.0.0.1')),
    );
  }
  for (const file of ['Dockerfile', 'backend/Dockerfile']) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    check(`${file}: production default`, () => assert(/^ENV NODE_ENV=production$/m.test(source)));
    check(`${file}: dynamic health port`, () => assert(source.includes('process.env.PORT')));
  }
  const uriOnly = JSON.parse(
    docker(
      [
        'compose',
        '--project-name',
        'codex-config-verification',
        '--env-file',
        envFile,
        '-f',
        path.join(root, 'docker-compose.yml'),
        'config',
        '--format',
        'json',
      ],
      {
        DATABASE_URL:
          'postgresql://fixture_user:fictional-password@fixture.pooler.supabase.com:6543/postgres',
        DB_PASSWORD: '',
        DB_USER: '',
      },
    ),
  );
  check('shared: URI-only credentials accepted', () =>
    assert(uriOnly.services.backend.environment.DATABASE_URL),
  );
  check('shared: local PostgreSQL is opt-in', () => assert(!uriOnly.services.postgres));
  check('shared: local PostgreSQL not required for startup', () => {
    const dependency = uriOnly.services.backend.depends_on?.postgres;
    assert(!dependency || dependency.required === false);
  });
  if (process.env.ERP_DOCKER_CONTEXT_DRILL === '1') {
    const context = path.join(work, 'context');
    await fs.mkdir(context);
    await fs.copyFile(path.join(root, '.dockerignore'), path.join(context, '.dockerignore'));
    const forbidden = [
      '.env',
      'backend/.env',
      'backend/.postgres.local',
      'backend/backups/customer.json',
      'backend/logs/customer.log',
      'backend/node_modules/private.txt',
      '.codex/token.json',
      '.aws/credentials',
      'scratch/secret.txt',
      'frontend/android/signing-private/key',
      'BinAlAgoouz-Debug.apk',
      'cashier.exe',
      'frontend/android/gradle-cache/private.txt',
      'backend/unlisted-private.txt',
      'backend/scripts/unlisted-private.txt',
      'backend/certs/private.pem',
    ];
    for (const file of forbidden) {
      await fs.mkdir(path.dirname(path.join(context, file)), { recursive: true });
      await fs.writeFile(path.join(context, file), 'synthetic audit marker only');
    }
    const allowed = [
      'backend/src/index.ts',
      'backend/certs/prod-ca-2021.crt',
      'frontend/src/main.ts',
    ];
    for (const file of allowed) {
      await fs.mkdir(path.dirname(path.join(context, file)), { recursive: true });
      await fs.writeFile(path.join(context, file), 'synthetic public source marker');
    }
    const contextCheck = `import fs from 'node:fs';\nconst bad=${JSON.stringify(forbidden)}.filter(p=>fs.existsSync('/context/'+p));\nconst missing=${JSON.stringify(allowed)}.filter(p=>!fs.existsSync('/context/'+p));\nconsole.log(JSON.stringify({forbiddenPathsPresent:bad,publicSourceMissing:missing}));\nif(bad.length||missing.length)process.exit(1);`;
    // Reuse a locally available image; this drill sends only synthetic markers
    // to the local Docker daemon. It never builds the live, unfiltered repository.
    await fs.writeFile(
      path.join(context, 'Dockerfile'),
      'FROM alagoouz-erp-backend:latest\nCOPY . /context/\n',
    );
    tag = `codex-docker-context:${randomUUID()}`;
    docker(['build', '--network=none', '-t', tag, context]);
    try {
      console.log(
        docker([
          'run',
          '--rm',
          '--network=none',
          '--entrypoint',
          'node',
          tag,
          '--input-type=module',
          '-e',
          contextCheck,
        ]).trim(),
      );
      console.log('PASS real Docker context exclusions');
    } catch (error) {
      failures++;
      console.log('FAIL real Docker context exclusions');
      if (error.stdout) console.log(String(error.stdout).trim());
    }
  }
} finally {
  if (tag) docker(['image', 'rm', tag]);
  // Only the directory created by this invocation can be removed.
  assert(
    path.dirname(work) === path.join(root, 'scratch') &&
      path.basename(work).startsWith('docker-config-'),
  );
  await fs.rm(work, { recursive: true, force: true });
}
console.log(
  JSON.stringify({ failures, contextDrill: process.env.ERP_DOCKER_CONTEXT_DRILL === '1' }),
);
process.exitCode = failures ? 1 : 0;

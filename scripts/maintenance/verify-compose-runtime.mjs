import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// Runs the actual Compose file only on a fresh ephemeral Linux CI runner.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Linux');
const root = process.cwd();
assert.ok(fs.existsSync(path.join(root, 'docker-compose.yml')));
const project = `erp-compose-${randomUUID()}`;
const directory = fs.mkdtempSync(path.join(root, 'scratch/compose-verification-'));
const envFile = path.join(directory, 'fixture.env');
const fixture = {
  PORT: '3017',
  DATABASE_URL: '',
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_NAME: 'compose_fixture_test',
  DB_USER: 'compose_fixture',
  DB_PASSWORD: 'SyntheticComposeDatabase123!',
  DB_SSL: 'false',
  DB_POOL_MODE: 'auto',
  DB_POOL_MAX: '3',
  DB_MAINTENANCE_POOL_MAX: '3',
  JWT_SECRET: 'synthetic-compose-access-secret-never-deploy-2026',
  JWT_REFRESH_SECRET: 'synthetic-compose-refresh-secret-never-deploy-2026',
  BACKUP_ENCRYPTION_KEY: 'synthetic-compose-backup-secret-never-deploy-2026',
  REDIS_URL: 'redis://redis:6379',
  CORS_ORIGIN: 'http://localhost:3017',
};
fs.writeFileSync(
  envFile,
  Object.entries(fixture)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'),
);
const docker = (args, options = {}) => {
  const output = execFileSync('docker', args, {
    env: { ...process.env, ...fixture },
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
};
const args = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  envFile,
  '--profile',
  'local-db',
  '-f',
  path.join(root, 'docker-compose.yml'),
];
const compose = (commands, options) => docker([...args, ...commands], options);
const names = ['bin_al_ajouz_db', 'bin_al_ajouz_redis', 'bin_al_ajouz_api'];
for (const name of names) {
  assert.equal(
    docker(['ps', '-aq', '--filter', `name=^/${name}$`]),
    '',
    `Existing container: ${name}`,
  );
}
const base = 'http://127.0.0.1:3017';
const headers = {
  'Content-Type': 'application/json',
  Origin: 'null',
  'X-Client-Type': 'desktop-pos',
  'User-Agent': 'AlAgoouz-POS Electron/44.4.3',
};
const statuses = {};
let started = false;
let client;
try {
  started = true;
  compose(['up', '--build', '-d', '--wait', '--wait-timeout', '120'], { stdio: 'inherit' });
  for (const name of names) {
    assert.equal(
      docker([
        'inspect',
        '--format',
        '{{index .Config.Labels "com.docker.compose.project"}}',
        name,
      ]),
      project,
    );
    assert.equal(docker(['inspect', '--format', '{{.State.Health.Status}}', name]), 'healthy');
  }
  assert.equal(compose(['exec', '-T', 'redis', 'redis-cli', 'ping']), 'PONG');
  assert.equal(
    compose(['exec', '-T', 'redis', 'redis-cli', 'set', 'compose-fixture', 'persisted']),
    'OK',
  );
  const html = await fetch(`${base}/products`, { signal: AbortSignal.timeout(10_000) });
  statuses.web = html.status;
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<div id="app"/);
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) });
  statuses.health = health.status;
  assert.equal(health.status, 200);
  client = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    database: fixture.DB_NAME,
    user: fixture.DB_USER,
    password: fixture.DB_PASSWORD,
  });
  await client.connect();
  const ledger = (await client.query('SELECT version FROM schema_migrations')).rows.map(
    (row) => row.version,
  );
  const migrations = fs.readdirSync('backend/migrations').filter((file) => file.endsWith('.sql'));
  assert.deepEqual(
    migrations.filter((file) => !ledger.includes(file)),
    [],
  );
  const role = (await client.query("SELECT id FROM roles WHERE name='admin'")).rows[0];
  assert.ok(role);
  const username = `compose-${randomUUID()}`;
  const password = 'SyntheticComposeUser123!';
  const user = (
    await client.query(
      `INSERT INTO users(username,password_hash,full_name,role_id,is_active)
    VALUES($1,$2,'Compose fixture',$3,TRUE) RETURNING id`,
      [username, await bcrypt.hash(password, 10), role.id],
    )
  ).rows[0];
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10_000),
  });
  statuses.login = login.status;
  assert.equal(login.status, 200);
  const session = (await login.json()).data;
  assert.equal(session.user.id, user.id);
  assert.equal(login.headers.getSetCookie().length, 0);
  assert.ok(session.refreshToken);
  headers.Authorization = `Bearer ${session.token}`;
  const backup = await fetch(`${base}/api/v1/backup/create`, {
    method: 'POST',
    headers,
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  });
  statuses.backup = backup.status;
  assert.equal(backup.status, 200);
  const file = (await backup.json()).data.file;
  assert.match(file, /^backup-[a-zA-Z0-9T.-]+\.json$/);
  const backupCheck = `const fs=require('fs');const assert=require('assert/strict');const value=JSON.parse(fs.readFileSync('/app/backend/backups/'+${JSON.stringify(file)},'utf8'));assert.equal(value.encrypted,true);assert.equal(typeof value.payload,'string');assert(!value.data)`;
  compose(['exec', '-T', 'backend', 'node', '-e', backupCheck]);
  await client.end();
  client = undefined;
  compose(['down'], { stdio: 'inherit' });
  compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '120'], { stdio: 'inherit' });
  compose(['exec', '-T', 'backend', 'node', '-e', backupCheck]);
  assert.equal(
    compose(['exec', '-T', 'redis', 'redis-cli', 'get', 'compose-fixture']),
    'persisted',
  );
  const profile = await fetch(`${base}/api/v1/auth/profile`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  statuses.profileAfterRecreate = profile.status;
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).data.user.id, user.id);
  fs.mkdirSync('docs/audits/evidence', { recursive: true });
  fs.writeFileSync(
    'docs/audits/evidence/compose-runtime-2026-10-08.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        actualComposeFileUsed: true,
        freshDatabaseBootstrap: true,
        servicesHealthy: ['postgres', 'redis', 'backend'],
        migrationFiles: migrations.length,
        pendingMigrations: 0,
        statuses,
        databaseAndSessionSurvivedRecreate: true,
        redisDataSurvivedRecreate: true,
        encryptedBackupSurvivedRecreate: true,
        productionDatabaseTouched: false,
        sharedSupabaseModeTested: false,
        userHostDockerDaemonTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: fresh Compose bootstrap, migrations, web/API, Redis and persistent encrypted backups.',
  );
} finally {
  if (client) await client.end();
  if (started) {
    // Compose project ownership is checked before removing this invocation's resources.
    for (const name of names) {
      if (docker(['ps', '-aq', '--filter', `name=^/${name}$`])) {
        assert.equal(
          docker([
            'inspect',
            '--format',
            '{{index .Config.Labels "com.docker.compose.project"}}',
            name,
          ]),
          project,
        );
      }
    }
    compose(['down', '--volumes'], { stdio: 'inherit' });
  }
}

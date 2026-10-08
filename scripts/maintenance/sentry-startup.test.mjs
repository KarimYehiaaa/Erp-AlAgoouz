import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const isolatedStartupEnv = (dsn) => ({
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
  DB_NAME: 'isolated_sentry_startup_test',
  DB_USER: 'isolated-fixture-user',
  DB_PASSWORD: 'isolated-fixture-password',
  DB_SSL: 'false',
  DB_SSL_CA_FILE: '',
  DB_POOL_MODE: 'auto',
  JWT_SECRET: 'Isolated-Sentry-startup-access-key-never-deploy',
  JWT_REFRESH_SECRET: 'Isolated-Sentry-startup-refresh-key-never-deploy',
  BACKUP_ENCRYPTION_KEY: 'Isolated-Sentry-startup-backup-key-never-deploy',
  VERCEL: '',
  VERCEL_ENV: '',
  VERCEL_URL: '',
  SUPPRESS_CONFIG_LOG: '1',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  SENTRY_DSN: dsn,
});

for (const entry of ['api/index.ts', 'backend/api/index.ts']) {
  test(`${entry} does not load database dependencies before the instrumented app`, () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
        import { registerHooks } from 'node:module';
        let pgRequests = 0;
        let sdkRequests = 0;
        const observer = registerHooks({ resolve(specifier, context, nextResolve) {
          if (specifier === 'pg') pgRequests++;
          if (specifier === '@sentry/node') sdkRequests++;
          return nextResolve(specifier, context);
        }});
        await import(${JSON.stringify('./' + entry)});
        observer.deregister();
        console.log('EARLY_PG_REQUESTS=' + pgRequests);
        console.log('EARLY_SDK_REQUESTS=' + sdkRequests);
        const { closePool } = await import('./backend/src/database/pool.ts');
        await closePool();
        `,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 20000,
        windowsHide: true,
        env: isolatedStartupEnv(''),
      },
    );
    const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    assert.ok(!child.error, child.error?.code);
    assert.equal(child.status, 0, output);
    assert.match(output, /EARLY_PG_REQUESTS=0(?:\r?\n|$)/);
    assert.match(output, /EARLY_SDK_REQUESTS=0(?:\r?\n|$)/);
  });

  test(`${entry} contains actual production configuration failure on first request`, () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
        const { default: handler } = await import(${JSON.stringify('./' + entry)});
        let statusCode;
        let body;
        const response = {
          headersSent: false,
          status(code) { statusCode = code; return this; },
          json(value) { body = value; },
        };
        await handler({ method: 'GET', url: '/health', headers: {} }, response);
        console.log('FIXTURE_RESPONSE=' + JSON.stringify({ statusCode, body }));
        `,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 20000,
        windowsHide: true,
        env: {
          ...isolatedStartupEnv(''),
          NODE_ENV: 'production',
          VERCEL: '1',
          JWT_SECRET: '',
          JWT_REFRESH_SECRET: '',
        },
      },
    );
    const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    assert.ok(!child.error, child.error?.code);
    assert.equal(child.status, 0, output);
    const result = JSON.parse(output.match(/FIXTURE_RESPONSE=(.+)/)?.[1] || '{}');
    assert.equal(result.statusCode, 500);
    assert.deepEqual(Object.keys(result.body).sort(), ['message', 'success']);
    assert.equal(result.body.success, false);
    assert.equal(typeof result.body.message, 'string');
    assert.doesNotMatch(JSON.stringify(result.body), /JWT_SECRET|isolated-fixture-password|stack/);
  });
}

test(
  'initializes Sentry before Express is loaded through the shared app loader',
  { timeout: 30000 },
  () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
    import { createRequire } from 'node:module';
    import path from 'node:path';
    const require = createRequire(path.join(process.cwd(), 'backend/package.json'));
    const stage = (name) => console.log('FIXTURE_STAGE=' + name + ':' + Math.round(performance.now()));
    stage('before_loader');
    const { loadInstrumentedApp } = await import('./backend/src/appLoader.ts');
    await loadInstrumentedApp();
    stage('app_loaded');
    const Sentry = require('@sentry/node');
    console.log('SENTRY_INITIALIZED=' + Boolean(Sentry.getClient()));
    // Keep all fixture telemetry in memory, and exercise the actual framework hooks.
    Sentry.getClient().getTransport().send = async () => ({ statusCode: 200 });
    const express = require('express');
    const http = require('node:http');
    const fixtureApp = express();
    let frameworkSpanOp = '';
    fixtureApp.get('/__sentry_fixture_trace', (_request, response) => {
      const span = Sentry.getActiveSpan();
      frameworkSpanOp = span ? Sentry.spanToJSON(span).op : '';
      response.json({ fixture: true });
    });
    const server = http.createServer(fixtureApp);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
      await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + server.address().port + '/__sentry_fixture_trace', (response) => {
          response.resume(); response.once('end', resolve); response.once('error', reject);
        }).once('error', reject);
      });
    } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    console.log('EXPRESS_ACTIVE_SPAN_OP=' + frameworkSpanOp);
    await Sentry.close(2000);
    stage('sentry_closed');
    const { closePool } = await import('./backend/src/database/pool.ts');
    await closePool();
    stage('pool_closed');
  `,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 20000,
        windowsHide: true,
        env: isolatedStartupEnv('https://public@example.invalid/1'),
      },
    );
    const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    const stages = output.match(/FIXTURE_STAGE=[a-z_]+:\d+/g) ?? [];
    assert.ok(!child.error, `${child.error?.code ?? 'child failure'}; ${stages.join(', ')}`);
    assert.equal(child.status, 0, output);
    assert.ok(output.includes('SENTRY_INITIALIZED=true'), output);
    assert.match(output, /EXPRESS_ACTIVE_SPAN_OP=request_handler\.express(?:\r?\n|$)/);
    assert.doesNotMatch(output, /express is not instrumented/i);
  },
);

test(
  'loads the application without resolving the optional SDK when Sentry is disabled',
  { timeout: 30000 },
  () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
    import { registerHooks } from 'node:module';
    let sdkRequests = 0;
    const observer = registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === '@sentry/node') sdkRequests++;
      return nextResolve(specifier, context);
    }});
    const { loadInstrumentedApp } = await import('./backend/src/appLoader.ts');
    await loadInstrumentedApp();
    observer.deregister();
    console.log('SDK_REQUESTS=' + sdkRequests);
    const { closePool } = await import('./backend/src/database/pool.ts');
    await closePool();
  `,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 20000,
        env: isolatedStartupEnv(''),
      },
    );
    assert.ok(!child.error, child.error?.code ?? 'child failure');
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /SDK_REQUESTS=0(?:\r?\n|$)/);
  },
);

test('preloads the Sentry instrumentation in every local backend start mode', async () => {
  const manifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'backend/package.json'), 'utf8'),
  );
  const { runtimeCommand } = await import('../../backend/scripts/start-runtime.mjs');
  for (const name of ['start', 'start:prod', 'dev']) {
    assert.equal(
      manifest.scripts[name],
      `node scripts/start-runtime.mjs${name === 'dev' ? ' --watch' : ''}`,
      name,
    );
    const command = runtimeCommand(path.join(repositoryRoot, 'backend'), name === 'dev');
    assert.deepEqual(command.args.slice(0, 3), ['--import', 'tsx', '--import']);
    assert.equal(
      fileURLToPath(command.args[3]),
      path.join(repositoryRoot, 'backend/src/services/sentryInstrumentation.ts'),
    );
    assert.equal(command.args.includes('--watch'), name === 'dev');
    assert.equal(command.args.at(-1), path.join(repositoryRoot, 'backend/src/index.ts'));
  }
});

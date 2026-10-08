import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const config = ts.readConfigFile(fileURLToPath(new URL('tsconfig.json', root)), ts.sys.readFile);
assert.equal(config.error, undefined);
const options = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, '.').options;

test('explicit serverless files include migrations and public CA without private or generated artifacts', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'AlAgoouz-Serverless-Include-Test-'));
  try {
    const required = [
      'backend/api/index.ts',
      'backend/src/app.ts',
      'backend/migrations/100_initial_receipt_journal_sources.sql',
      'backend/certs/prod-ca-2021.crt',
      'shared/types.ts',
      'assets/logo.png',
    ];
    const forbidden = [
      'backend/certs/key.pem',
      'backend/certs/cert.pem',
      'backend/.env',
      'backend/backups/backup.json',
      'backend/logs/runtime.log',
      'backend/node-compile-cache/blob',
      'backend/tests/fixture.test.ts',
      'backend/scripts/factory-reset.ts',
      'backend/node_modules/private-tool/index.js',
    ];
    for (const file of [...required, ...forbidden]) {
      const target = path.join(fixture, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'synthetic file; no keys or business data');
    }
    const deployment = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));
    const included = fs
      .globSync(deployment.functions['api/**/*'].includeFiles, { cwd: fixture })
      .map((file) => file.split(path.sep).join('/'));
    for (const file of required)
      assert.ok(included.includes(file), `Missing runtime file: ${file}`);
    for (const file of forbidden)
      assert.ok(!included.includes(file), `Included non-runtime/private file: ${file}`);
    const standalone = JSON.parse(fs.readFileSync(new URL('backend/vercel.json', root), 'utf8'));
    const standaloneIncluded = fs
      .globSync(standalone.functions['api/**/*'].includeFiles, {
        cwd: path.join(fixture, 'backend'),
      })
      .map((file) => file.split(path.sep).join('/'));
    assert.ok(standaloneIncluded.includes('migrations/100_initial_receipt_journal_sources.sql'));
    assert.ok(standaloneIncluded.includes('certs/prod-ca-2021.crt'));
    assert.ok(standaloneIncluded.includes('../assets/logo.png'));
    assert.ok(!standaloneIncluded.includes('certs/key.pem'));
  } finally {
    assert.equal(path.dirname(fixture), os.tmpdir());
    assert.ok(path.basename(fixture).startsWith('AlAgoouz-Serverless-Include-Test-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('serverless entry imports refer to emitted JavaScript files', () => {
  for (const name of [
    'api/health.ts',
    'api/[...slug].ts',
    'api/index.ts',
    'backend/api/index.ts',
    'backend/src/app.ts',
  ]) {
    const source = fs.readFileSync(new URL(name, root), 'utf8');
    const emitted = ts.transpileModule(source, { compilerOptions: options }).outputText;
    assert.doesNotMatch(emitted, /(?:from\s*|import\s*(?:\(\s*)?)['"][^'"]+\.ts['"]/, name);
  }
});

test('backend Vercel routes resolve to a TypeScript function source', () => {
  const config = JSON.parse(fs.readFileSync(new URL('backend/vercel.json', root), 'utf8'));
  const destinations = config.rewrites.map(({ destination }) => destination);
  assert.deepEqual(destinations, ['/api/index', '/api/index']);
  assert.ok(fs.existsSync(new URL('backend/api/index.ts', root)));
});

test('both Vercel backends preload Sentry through the shared lazy Express app loader', () => {
  const entrypoints = [
    ['api/index.ts', '../backend/src/appLoader.ts'],
    ['backend/api/index.ts', '../src/appLoader.ts'],
  ];

  for (const [entrypoint, loaderPath] of entrypoints) {
    const source = fs.readFileSync(new URL(entrypoint, root), 'utf8');
    assert.ok(source.includes(loaderPath), `${entrypoint} must use the shared app loader`);
    assert.match(source, /loadInstrumentedApp\(\)/, `${entrypoint} must load the instrumented app`);
    assert.doesNotMatch(source, /import\s+app\s+from\s+['"][^'"]*src\/app\.ts['"]/, entrypoint);
  }
});

test('root Vercel deployment uses the hosted frontend CSP build', () => {
  const config = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));
  const frontend = JSON.parse(fs.readFileSync(new URL('frontend/package.json', root), 'utf8'));

  assert.equal(config.buildCommand, 'npm run build -w frontend');
  assert.equal(config.outputDirectory, 'frontend/dist');
  assert.equal(frontend.scripts.build, 'vite build');
  assert.equal(frontend.scripts['build:local'], 'vite build --mode shop');
  assert.ok(config.headers.some(({ source }) => source === '/(.*)'));
});

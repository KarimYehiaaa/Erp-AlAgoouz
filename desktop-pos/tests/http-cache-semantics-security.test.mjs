import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  readFileSync,
  realpathSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import CachePolicy from 'http-cache-semantics';

const desktopRequire = createRequire(new URL('../package.json', import.meta.url));
const installedEntry = desktopRequire.resolve('http-cache-semantics');
const installerScript = fileURLToPath(
  new URL('../scripts/patch-http-cache-semantics.mjs', import.meta.url),
);
const sha = (source) => createHash('sha256').update(source).digest('hex');

const reviewedUpstreamSource = () => {
  const source = readFileSync(installedEntry, 'utf8').replace(/\r\n/g, '\n');
  // Reconstruct the exact published input from the installed reviewed patch;
  // the independent upstream digest prevents an incorrect fixture from passing.
  const start = source.indexOf('\n            // ERP_SECURITY_PATCH_V3:');
  const end = source.indexOf('\n\n            // If a value is present', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const original = (source.slice(0, start) + source.slice(end + 1)).replace(
    "if (this._rescc['must-revalidate'] && this.stale()) {",
    "if (this._rescc['must-revalidate']) {",
  );
  expect(sha(original)).toBe('ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca');
  return original;
};

const cleanupFixture = (directory) => {
  const resolved = realpathSync(directory);
  expect(resolved.startsWith(realpathSync(tmpdir()) + path.sep)).toBe(true);
  expect(path.basename(resolved)).toMatch(/^erp-http-cache-owned-/);
  rmSync(resolved, { recursive: true, force: true });
};

const patchFixture = (source, version = '4.3.0') => {
  const directory = mkdtempSync(path.join(tmpdir(), 'erp-http-cache-owned-'));
  const desktop = path.join(directory, 'desktop-pos');
  const packageDirectory = path.join(desktop, 'node_modules/http-cache-semantics');
  const script = path.join(desktop, 'scripts/patch-http-cache-semantics.mjs');
  mkdirSync(packageDirectory, { recursive: true });
  mkdirSync(path.dirname(script), { recursive: true });
  writeFileSync(path.join(desktop, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({
      name: 'http-cache-semantics',
      version,
      main: 'index.js',
    }),
  );
  const entry = path.join(packageDirectory, 'index.js');
  writeFileSync(entry, source);
  copyFileSync(installerScript, script);
  return { directory, packageDirectory, entry, script };
};

const runPatchFixture = (fixture, preload) =>
  spawnSync(
    process.execPath,
    [...(preload ? ['--import', pathToFileURL(preload).href] : []), fixture.script],
    {
      cwd: tmpdir(),
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: '' },
    },
  );

const request = {
  url: 'https://example.test/account',
  method: 'GET',
  headers: { host: 'example.test' },
};

const evaluate = (responseHeaders) => {
  const policy = new CachePolicy(
    request,
    { status: 200, headers: responseHeaders },
    { shared: true },
  );
  const result = policy.evaluateRequest({
    ...request,
    headers: { host: 'example.test', 'cache-control': 'max-stale=86400' },
  });
  return { policy, result };
};

describe('shared-cache stale-response security', () => {
  it("patches the exact http-cache-semantics package used by electron-builder's cache dependency", () => {
    const builderRequire = createRequire(desktopRequire.resolve('app-builder-lib/package.json'));
    const electronGetRequire = createRequire(builderRequire.resolve('@electron/get/package.json'));
    const gotRequire = createRequire(electronGetRequire.resolve('got/package.json'));
    const cacheableRequire = createRequire(gotRequire.resolve('cacheable-request/package.json'));
    const transitiveEntry = cacheableRequire.resolve('http-cache-semantics');
    const directEntry = desktopRequire.resolve('http-cache-semantics');
    const transitivePackage = JSON.parse(
      readFileSync(path.join(path.dirname(transitiveEntry), 'package.json'), 'utf8'),
    );
    const transitiveSource = readFileSync(transitiveEntry, 'utf8');

    expect(realpathSync(transitiveEntry)).toBe(realpathSync(directEntry));
    expect(transitivePackage.version).toBe('4.3.0');
    expect(transitiveSource).toContain('ERP_SECURITY_PATCH_V3');
  });

  it.each([
    [
      'Set-Cookie without public',
      { 'cache-control': 'max-age=3600', 'set-cookie': 'session=secret' },
    ],
    ['proxy-revalidate', { 'cache-control': 'max-age=3600, proxy-revalidate', etag: 'v1' }],
    ['no-cache', { 'cache-control': 'max-age=3600, no-cache', etag: 'v1' }],
    ['no-store', { 'cache-control': 'max-age=3600, no-store', etag: 'v1' }],
    ['private', { 'cache-control': 'max-age=3600, private', etag: 'v1' }],
  ])('does not let max-stale bypass %s', (_scenario, responseHeaders) => {
    const { policy, result } = evaluate(responseHeaders);

    expect(policy.maxAge()).toBe(0);
    expect(result.response).toBeUndefined();
    expect(result.revalidation).toBeDefined();
  });

  it('does not serve a non-storable response under max-stale', () => {
    const policy = new CachePolicy(
      request,
      { status: 500, headers: { 'cache-control': 'max-age=3600' } },
      { shared: true },
    );
    const result = policy.evaluateRequest({
      ...request,
      headers: { host: 'example.test', 'cache-control': 'max-stale=86400' },
    });

    expect(policy.storable()).toBe(false);
    expect(result.response).toBeUndefined();
    expect(result.revalidation).toBeDefined();
  });

  it('preserves max-stale for an explicitly public shared response', () => {
    const { policy, result } = evaluate({
      'cache-control': 'public, max-age=1',
      'set-cookie': 'public-session=allowed',
    });
    policy.now = () => Date.now() + 2_000;

    const staleResult = policy.evaluateRequest({
      ...request,
      headers: { host: 'example.test', 'cache-control': 'max-stale=86400' },
    });

    expect(result.response).toBeDefined();
    expect(staleResult.response).toBeDefined();
  });

  it('serves a fresh must-revalidate response, then revalidates it once stale', () => {
    const { policy, result } = evaluate({
      'cache-control': 'public, max-age=1, must-revalidate',
      etag: 'v1',
    });
    expect(result.response).toBeDefined();
    expect(result.revalidation).toBeUndefined();
    const observed = policy.now();
    policy.now = () => observed + 2_000;
    const stale = policy.evaluateRequest({
      ...request,
      headers: { host: 'example.test', 'cache-control': 'max-stale=86400' },
    });
    expect(stale.response).toBeUndefined();
    expect(stale.revalidation).toBeDefined();
  });

  it('revalidates stale shared s-maxage even when max-stale or stale-while-revalidate allows reuse', () => {
    const { policy } = evaluate({
      'cache-control': 'public, max-age=3600, s-maxage=1, stale-while-revalidate=86400',
      etag: 'v1',
    });
    const observed = policy.now();
    policy.now = () => observed + 2_000;
    for (const headers of [
      { host: 'example.test' },
      {
        host: 'example.test',
        'cache-control': 'max-stale=86400',
      },
    ]) {
      const result = policy.evaluateRequest({ ...request, headers });
      expect(result.response).toBeUndefined();
      expect(result.revalidation).toBeDefined();
      expect(result.revalidation.synchronous).toBe(true);
    }
  });

  it('keeps s-maxage restricted to shared caches and preserves private freshness', () => {
    const policy = new CachePolicy(
      request,
      {
        status: 200,
        headers: { 'cache-control': 'max-age=3600, s-maxage=1', etag: 'v1' },
      },
      { shared: false },
    );
    const observed = policy.now();
    policy.now = () => observed + 2_000;
    expect(policy.evaluateRequest(request).response).toBeDefined();
    expect(policy.maxAge()).toBe(3600);
  });
});

// Atomicity fixtures may launch two children, each retaining its 15s hard limit.
// Allow startup and cleanup without weakening any fault/rollback assertion.
describe('reviewed dependency patch installation', { timeout: 40_000 }, () => {
  it('preserves the upstream file and removes staging after an actual partial write failure', () => {
    const original = reviewedUpstreamSource();
    const fixture = patchFixture(original);
    try {
      const shim = path.join(fixture.directory, 'partial-write.mjs');
      const moduleSource = `export * from 'node:fs/promises';
import { open as realOpen } from 'node:fs/promises';
export async function open(file, flags) {
  const handle = await realOpen(file, flags);
  return {
    async writeFile() { await handle.writeFile('partial fixture'); throw new Error('Isolated partial-write failure'); },
    close() { return handle.close(); }
  };
}`;
      writeFileSync(
        shim,
        `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'node:fs/promises' && context.parentURL === ${JSON.stringify(pathToFileURL(fixture.script).href)})
    return { url: ${JSON.stringify('data:text/javascript,' + encodeURIComponent(moduleSource))}, shortCircuit: true };
  return nextResolve(specifier, context);
}});`,
      );
      const failed = runPatchFixture(fixture, shim);
      expect(failed.error).toBeUndefined();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('Isolated partial-write failure');
      expect(readFileSync(fixture.entry, 'utf8')).toBe(original);
      expect(
        readdirSync(fixture.packageDirectory).filter((name) =>
          name.startsWith('.erp-cache-patch-'),
        ),
      ).toEqual([]);
      const retry = runPatchFixture(fixture);
      expect(retry.error).toBeUndefined();
      expect(retry.status, retry.stderr).toBe(0);
    } finally {
      cleanupFixture(fixture.directory);
    }
  });

  it('patches a fresh relocated upstream package atomically and is idempotent', () => {
    const fixture = patchFixture(reviewedUpstreamSource());
    try {
      const first = runPatchFixture(fixture);
      expect(first.error).toBeUndefined();
      expect(first.status, first.stderr).toBe(0);
      const patched = readFileSync(fixture.entry, 'utf8');
      expect(patched).toContain('ERP_SECURITY_PATCH_V3');
      const FixtureCache = createRequire(fixture.entry)(fixture.entry);
      const policy = new FixtureCache(
        request,
        {
          status: 200,
          headers: { 'cache-control': 'max-age=3600', 'set-cookie': 'fixture' },
        },
        { shared: true },
      );
      expect(
        policy.evaluateRequest({
          ...request,
          headers: {
            host: 'example.test',
            'cache-control': 'max-stale=86400',
          },
        }).response,
      ).toBeUndefined();
      const second = runPatchFixture(fixture);
      expect(second.error).toBeUndefined();
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('Verified local');
      expect(readFileSync(fixture.entry, 'utf8')).toBe(patched);
      expect(
        readdirSync(fixture.packageDirectory).filter((name) =>
          name.startsWith('.erp-cache-patch-'),
        ),
      ).toEqual([]);
    } finally {
      cleanupFixture(fixture.directory);
    }
  });

  it.each(['out-of-branch-change', 'forged-marker'])(
    'rejects %s without writing unknown source',
    (scenario) => {
      const known = readFileSync(installedEntry, 'utf8');
      const altered =
        scenario === 'out-of-branch-change'
          ? known + '\n// unreviewed source\n'
          : known.replace("('s-maxage' in this._rescc)", 'false');
      expect(altered).not.toBe(known);
      const fixture = patchFixture(altered);
      try {
        const result = runPatchFixture(fixture);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unreviewed http-cache-semantics source');
        expect(readFileSync(fixture.entry, 'utf8')).toBe(altered);
      } finally {
        cleanupFixture(fixture.directory);
      }
    },
  );

  it('refuses an unreviewed package version before changing its source', () => {
    const original = reviewedUpstreamSource();
    const fixture = patchFixture(original, '4.3.1');
    try {
      const result = runPatchFixture(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Expected reviewed http-cache-semantics 4.3.0');
      expect(readFileSync(fixture.entry, 'utf8')).toBe(original);
    } finally {
      cleanupFixture(fixture.directory);
    }
  });

  it('refuses a dependency junction outside the copied project', () => {
    const original = reviewedUpstreamSource();
    const fixture = patchFixture(original);
    const external = mkdtempSync(path.join(tmpdir(), 'erp-http-cache-owned-external-'));
    try {
      copyFileSync(
        path.join(fixture.packageDirectory, 'package.json'),
        path.join(external, 'package.json'),
      );
      writeFileSync(path.join(external, 'index.js'), original);
      const packageResolved = realpathSync(fixture.packageDirectory);
      expect(packageResolved.startsWith(realpathSync(fixture.directory) + path.sep)).toBe(true);
      rmSync(packageResolved, { recursive: true, force: true });
      symlinkSync(external, fixture.packageDirectory, 'junction');
      const result = runPatchFixture(fixture);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('outside project dependencies');
      expect(readFileSync(path.join(external, 'index.js'), 'utf8')).toBe(original);
    } finally {
      cleanupFixture(fixture.directory);
      cleanupFixture(external);
    }
  });
});

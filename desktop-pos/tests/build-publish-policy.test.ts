import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDesktopBuildEnvironment } from '../scripts/run-desktop-build.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const builderConfig = JSON.parse(
  readFileSync(new URL('../electron-builder.json', import.meta.url), 'utf8'),
);
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(
  new URL('../../.github/workflows/desktop-release.yml', import.meta.url),
  'utf8',
);

describe('installer artifact builds do not publish GitHub releases', () => {
  it('keeps Windows updater signature verification enabled', () => {
    expect(builderConfig.win.verifyUpdateCodeSignature).toBe(true);
  });

  it('keeps renderer-only utility libraries out of the packaged runtime dependency tree', () => {
    expect(pkg.dependencies).not.toHaveProperty('html2pdf.js');
    expect(pkg.dependencies).not.toHaveProperty('qrcode');
    expect(pkg.devDependencies).toHaveProperty('html2pdf.js');
    expect(pkg.devDependencies).toHaveProperty('qrcode');
    expect(pkg.devDependencies).toHaveProperty('@types/qrcode');
  });

  it('uses the safe installer command in CI and rejects publication overrides before building', () => {
    const invocation = workflow.match(/npm run electron:build([^\r\n]*)/);
    expect(invocation).not.toBeNull();
    const forwarded = (invocation![1] || '').trim().replace(/^--\s*/, '');
    expect(forwarded).toBe('');
    expect(pkg.scripts.build).toBe('node scripts/run-desktop-build.mjs renderer');
    expect(pkg.scripts['electron:build']).toBe('node scripts/run-desktop-build.mjs all');
    expect(pkg.scripts['build:installer']).toBe('node scripts/run-desktop-build.mjs installer');
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../scripts/build-installer.mjs', import.meta.url)),
        '--publish',
        'always',
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: node scripts/build-installer.mjs');
  });

  it('keeps the release workflow on the guarded build path and does not publish unsigned releases', () => {
    expect(releaseWorkflow).toMatch(/npm run electron:build/);
    expect(releaseWorkflow).toMatch(/actions\/upload-artifact@v4/);
    expect(releaseWorkflow).toMatch(/if-no-files-found: error/);
    expect(releaseWorkflow).not.toMatch(/electron-builder\s+--publish\s+always/i);
    expect(releaseWorkflow).not.toMatch(/GH_TOKEN/);
    expect(releaseWorkflow).not.toMatch(/contents:\s*write/);
    expect(releaseWorkflow).not.toMatch(/actions:\s*write/);
    expect(releaseWorkflow).toMatch(/contents:\s*read/);
  });

  it('creates a project-local temp directory for native build tools', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'alagoouz-desktop-build-test-'));
    const tempRoot = path.join(root, 'scratch', 'desktop-build-temp');
    let unsafeCleanupTarget: string | undefined;
    try {
      const env = createDesktopBuildEnvironment(root, {
        ...process.env,
        TEMP: 'old-temp',
        TMP: 'old-tmp',
        TMPDIR: 'old-tmpdir',
      });
      expect(env.TEMP).toBe(tempRoot);
      expect(env.TMP).toBe(tempRoot);
      expect(env.TMPDIR).toBe(tempRoot);
      expect(statSync(tempRoot).isDirectory()).toBe(true);
    } finally {
      const resolvedRoot = path.resolve(root);
      const tempPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
      if (
        !resolvedRoot.startsWith(tempPrefix) ||
        !path.basename(resolvedRoot).startsWith('alagoouz-desktop-build-test-')
      ) {
        unsafeCleanupTarget = resolvedRoot;
      } else {
        rmSync(resolvedRoot, { recursive: true, force: true });
      }
    }
    if (unsafeCleanupTarget) {
      throw new Error(`Refusing to remove unexpected test temp directory: ${unsafeCleanupTarget}`);
    }
  });
});

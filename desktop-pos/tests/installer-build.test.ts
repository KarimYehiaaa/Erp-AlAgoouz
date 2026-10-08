import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInstaller } from '../scripts/build-installer.mjs';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'AlAgoouz-Installer-Test-'));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, 'electron-builder.json'),
    JSON.stringify({
      directories: { output: 'release' },
      publish: [{ provider: 'github', owner: 'test', repo: 'test' }],
      files: ['dist/**/*', 'dist-electron/**/*', 'package.json'],
    }),
  );
  fs.mkdirSync(path.join(root, 'release'));
  fs.writeFileSync(path.join(root, 'release', 'POS-Setup.exe'), 'previous release');
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) === os.tmpdir() &&
      path.basename(root).startsWith('AlAgoouz-Installer-Test-')
    ) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('Windows installer staging', () => {
  it('restores all old files when installing the new metadata fails', async () => {
    const root = fixture();
    const release = path.join(root, 'release');
    fs.writeFileSync(path.join(release, 'POS-Setup.exe.blockmap'), 'previous blockmap');
    fs.writeFileSync(path.join(release, 'latest.yml'), 'previous metadata');
    const nativeRename = fs.renameSync;
    let failed = false;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (!failed && destination === path.join(release, 'latest.yml')) {
        failed = true;
        throw new Error('metadata replacement failed');
      }
      return nativeRename(source, destination);
    });
    const build = vi.fn(async ({ config }) => {
      const stage = JSON.parse(fs.readFileSync(config, 'utf8')).directories.output;
      for (const name of ['POS-Setup.exe', 'POS-Setup.exe.blockmap', 'latest.yml'])
        fs.writeFileSync(path.join(stage, name), `new ${name}`);
      return [path.join(stage, 'POS-Setup.exe')];
    });
    await expect(
      buildInstaller({ build, projectRoot: root, tempRoot: root, env: {} }),
    ).rejects.toThrow('metadata replacement failed');
    expect(failed).toBe(true);
    expect(fs.readFileSync(path.join(release, 'POS-Setup.exe'), 'utf8')).toBe('previous release');
    expect(fs.readFileSync(path.join(release, 'POS-Setup.exe.blockmap'), 'utf8')).toBe(
      'previous blockmap',
    );
    expect(fs.readFileSync(path.join(release, 'latest.yml'), 'utf8')).toBe('previous metadata');
    expect(fs.readdirSync(release).sort()).toEqual(
      ['POS-Setup.exe', 'POS-Setup.exe.blockmap', 'latest.yml'].sort(),
    );
  });
  it('preserves the whole previous release when transferring the second file fails', async () => {
    const root = fixture();
    const release = path.join(root, 'release');
    fs.writeFileSync(path.join(release, 'POS-Setup.exe.blockmap'), 'previous blockmap');
    fs.writeFileSync(path.join(release, 'latest.yml'), 'previous metadata');
    const nativeCopy = fs.copyFileSync;
    let transfers = 0;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, ...args) => {
      if (++transfers === 2) throw new Error('artifact transfer failed');
      return nativeCopy(source, destination, ...args);
    });
    const build = vi.fn(async ({ config }) => {
      const stage = JSON.parse(fs.readFileSync(config, 'utf8')).directories.output;
      for (const name of ['POS-Setup.exe', 'POS-Setup.exe.blockmap', 'latest.yml'])
        fs.writeFileSync(path.join(stage, name), `new ${name}`);
      return [path.join(stage, 'POS-Setup.exe')];
    });
    await expect(
      buildInstaller({ build, projectRoot: root, tempRoot: root, env: {} }),
    ).rejects.toThrow('artifact transfer failed');
    expect(fs.readFileSync(path.join(release, 'POS-Setup.exe'), 'utf8')).toBe('previous release');
    expect(fs.readFileSync(path.join(release, 'POS-Setup.exe.blockmap'), 'utf8')).toBe(
      'previous blockmap',
    );
    expect(fs.readFileSync(path.join(release, 'latest.yml'), 'utf8')).toBe('previous metadata');
  });
  it('preserves the previous release when the native builder fails', async () => {
    const root = fixture();
    const build = vi.fn(async ({ config }) => {
      const stage = JSON.parse(fs.readFileSync(config, 'utf8')).directories.output;
      fs.writeFileSync(path.join(stage, 'POS-Setup.exe'), 'partial native helper');
      throw new Error('NSIS helper failed');
    });
    await expect(
      buildInstaller({ build, projectRoot: root, tempRoot: root, env: {} }),
    ).rejects.toThrow('NSIS helper failed');
    expect(fs.readFileSync(path.join(root, 'release', 'POS-Setup.exe'), 'utf8')).toBe(
      'previous release',
    );
  });

  it('copies completed installer and updater files only after a successful staged build', async () => {
    const root = fixture();
    let stage;
    const build = vi.fn(async (options) => {
      expect(options.publish).toBe('never');
      expect(options.prepackaged).toBe(path.join(root, 'verified-unpacked'));
      const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
      stage = config.directories.output;
      expect(path.dirname(stage)).toBe(root);
      expect(stage).not.toBe(path.join(root, 'release'));
      expect(config.publish[0].provider).toBe('github');
      for (const file of ['POS-Setup.exe', 'POS-Setup.exe.blockmap', 'latest.yml']) {
        fs.writeFileSync(path.join(stage, file), `complete ${file}`);
      }
      return [path.join(stage, 'POS-Setup.exe')];
    });
    const artifacts = await buildInstaller({
      build,
      projectRoot: root,
      tempRoot: root,
      env: {},
      prepackaged: 'verified-unpacked',
    });
    expect(artifacts).toHaveLength(3);
    expect(fs.readFileSync(path.join(root, 'release', 'POS-Setup.exe'), 'utf8')).toBe(
      'complete POS-Setup.exe',
    );
    expect(fs.existsSync(stage)).toBe(false);
  });

  it('rejects a partial helper returned without the completed updater blockmap', async () => {
    const root = fixture();
    const build = vi.fn(async ({ config }) => {
      const stage = JSON.parse(fs.readFileSync(config, 'utf8')).directories.output;
      const file = path.join(stage, 'POS-Setup.exe');
      fs.writeFileSync(file, 'partial native helper');
      return [file];
    });
    await expect(
      buildInstaller({ build, projectRoot: root, tempRoot: root, env: {} }),
    ).rejects.toThrow('incomplete');
    expect(fs.readFileSync(path.join(root, 'release', 'POS-Setup.exe'), 'utf8')).toBe(
      'previous release',
    );
  });

  it('keeps the previous release when updater metadata is missing', async () => {
    const root = fixture();
    const build = vi.fn(async ({ config }) => {
      const stage = JSON.parse(fs.readFileSync(config, 'utf8')).directories.output;
      const file = path.join(stage, 'POS-Setup.exe');
      fs.writeFileSync(file, 'complete installer');
      fs.writeFileSync(`${file}.blockmap`, 'complete blockmap');
      return [file];
    });
    await expect(
      buildInstaller({ build, projectRoot: root, tempRoot: root, env: {} }),
    ).rejects.toThrow('incomplete');
    expect(fs.readFileSync(path.join(root, 'release', 'POS-Setup.exe'), 'utf8')).toBe(
      'previous release',
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const child = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => child);

afterEach(() => {
  vi.resetModules();
  child.execFileSync.mockReset();
});

describe('Windows updater restart routing', () => {
  it('delegates updater restarts to the shared verified runtime controller', async () => {
    const { buildWindowsRestartScript } =
      await import('../../scripts/maintenance/windowsRestart.ts');
    const script = buildWindowsRestartScript();

    expect(script).toContain('scripts/windows/runtime-control.ps1');
    expect(script).toContain('Start-ErpRuntime -ProjectRoot $projectRoot -Restart');
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
    expect(script).not.toContain('taskkill');
  });

  it('runs PowerShell without a shell and passes the restart script as one argument', async () => {
    const { restartWindowsBackend } = await import('../../scripts/maintenance/windowsRestart.ts');

    restartWindowsBackend();

    expect(child.execFileSync).toHaveBeenCalledOnce();
    const [executable, args, options] = child.execFileSync.mock.calls[0]!;
    expect(executable).toBe('powershell.exe');
    expect(args).toContain('-NonInteractive');
    expect(args.at(-1)).toContain('Start-ErpRuntime');
    expect(options).toMatchObject({
      cwd: fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, ''),
      stdio: 'inherit',
    });
  });
});

describe('Windows local-process control safety', () => {
  it('refuses to kill unrelated listeners and routes legacy stop/start through system.ps1', () => {
    const root = new URL('../../', import.meta.url);
    const systemScript = readFileSync(new URL('system.ps1', root), 'utf8');
    const stopScript = readFileSync(new URL('scripts/windows/stop-erp.ps1', root), 'utf8');
    const startScript = readFileSync(new URL('scripts/windows/start-erp.ps1', root), 'utf8');

    expect(systemScript).toContain('runtime-control.ps1');
    expect(systemScript).toContain('Stop-ErpRuntime $Root');
    expect(systemScript).toContain('Start-ErpRuntime $Root');
    expect(stopScript).toContain('system.ps1") stop');
    expect(startScript).toContain('system.ps1") start');
  });

  it('routes legacy Windows installers to the unified installer without creating competing tasks', () => {
    const root = new URL('../../', import.meta.url);
    const legacyTaskInstaller = readFileSync(
      new URL('scripts/windows/register-autostart.ps1', root),
      'utf8',
    );
    const pm2TaskInstaller = readFileSync(
      new URL('scripts/windows/install-windows-startup.ps1', root),
      'utf8',
    );

    expect(legacyTaskInstaller).toContain('install-services.ps1');
    expect(pm2TaskInstaller).toContain('install-services.ps1');
    expect(legacyTaskInstaller).not.toContain('Register-ScheduledTask');
    expect(pm2TaskInstaller).not.toContain('Register-ScheduledTask');
  });
});

describe('database schema readiness evaluation', () => {
  it('fails closed for missing tracking tables and pending migrations', async () => {
    const { assertDatabaseSchemaReady, evaluateSchemaReadiness } =
      await import('../src/database/schemaReadiness.ts');
    const migrations = ['001_initial.sql', '002_followup.sql'];

    expect(evaluateSchemaReadiness(migrations, false, [])).toMatchObject({
      ready: false,
      reason: 'tracking-table-missing',
    });
    expect(evaluateSchemaReadiness(migrations, true, ['001_initial.sql'])).toMatchObject({
      ready: false,
      pendingCount: 1,
      reason: 'pending-migrations',
    });
    expect(evaluateSchemaReadiness(migrations, true, migrations)).toEqual({
      ready: true,
      pendingCount: 0,
    });

    const missingTrackingTableQuery = vi.fn().mockResolvedValueOnce({ rows: [{ exists: false }] });
    await expect(assertDatabaseSchemaReady(missingTrackingTableQuery, migrations)).rejects.toThrow(
      /tracking-table-missing; 2 migration\(s\) pending/,
    );

    const pendingQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ version: '001_initial.sql' }] });
    await expect(assertDatabaseSchemaReady(pendingQuery, migrations)).rejects.toThrow(
      /1 migration\(s\) pending/,
    );

    const readyQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: migrations.map((version) => ({ version })) });
    await expect(assertDatabaseSchemaReady(readyQuery, migrations)).resolves.toBeUndefined();
  });

  it('checks skipped startup migrations before opening the HTTP listener', () => {
    const root = new URL('../../', import.meta.url);
    const server = readFileSync(new URL('backend/src/server.ts', root), 'utf8');

    expect(server.indexOf('await assertDatabaseSchemaReady')).toBeGreaterThan(-1);
    expect(server.indexOf('await assertDatabaseSchemaReady')).toBeLessThan(
      server.indexOf('const server = app.listen'),
    );
  });
});

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const buildWindowsRestartScript = (): string =>
  `
$ErrorActionPreference = 'Stop'
$projectRoot = (Get-Location).Path
. (Join-Path $projectRoot 'scripts/windows/runtime-control.ps1')
Start-ErpRuntime -ProjectRoot $projectRoot -Restart
exit 0
`.trim();

/** Restart only the verified project runtime and require owned HTTP/database readiness. */
export const restartWindowsBackend = (): void => {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildWindowsRestartScript()],
    { cwd: projectRoot, stdio: 'inherit' },
  );
};

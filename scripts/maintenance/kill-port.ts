import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopOwnedLinuxPort } from './ownedLinuxPort.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const main = async (): Promise<number> => {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `
$ErrorActionPreference = 'Stop'
$projectRoot = (Get-Location).Path
. (Join-Path $projectRoot 'scripts/windows/runtime-control.ps1')
Stop-ErpRuntime -ProjectRoot $projectRoot
if (@(Get-ErpRuntimeListeners).Count -gt 0) { throw 'Port 3000 remains occupied; cleanup failed.' }
exit 0
`.trim(),
        ],
        { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 180000 },
      );
    } else if (process.platform === 'linux') {
      await stopOwnedLinuxPort(root);
    } else {
      throw new Error(
        'Process ownership is unavailable on this platform; use the installed runtime manager.',
      );
    }
    console.log('تم التحقق من تحرير المنفذ 3000 بعد إيقاف عمليات المشروع المملوكة فقط.');
    return 0;
  } catch {
    console.error(
      'تعذر إثبات تحرير المنفذ 3000 بأمان. راجع ملكية العملية وصلاحياتها أو أوقف مدير الخدمة المثبت.',
    );
    return 1;
  }
};

const entry = process.argv[1] && path.resolve(process.argv[1]);
const thisFile = fileURLToPath(import.meta.url);
if (
  entry &&
  (process.platform === 'win32'
    ? entry.toLowerCase() === thisFile.toLowerCase()
    : entry === thisFile)
) {
  process.exitCode = await main();
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildArchiveName, buildTarCommand, runBackup, type BackupDeps } from '../../scripts/backup-system.ts';

/**
 * اختبار وحدة لـ backup-system.ts — عبر المنصات وبدون قاعدة بيانات.
 * المشكلة المعالَجة: على Windows (GNU tar من Git for Windows) يفسّر `D:` في
 * المعاملات المطلقة كـ hostname اتصال بعيد فيفشل بـ "Cannot connect to D: resolve failed".
 * الحل المثبَّت في السكربت: تشغيل tar من جذر المشروع (cwd: rootDir) بمسار نسبي
 * `full-backups/...`. الاختبار يحقن execSync/fs محاكاة (بلا tar فعلي ولا قاعدة بيانات)
 * ويتحقق من شكل الأمر الصادر والـ cwd.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const destinationFolder = path.join(rootDir, 'full-backups');

function makeDeps(): { deps: BackupDeps; calls: { cmd: string; opts: { cwd: string } }[] } {
  const calls: { cmd: string; opts: { cwd: string } }[] = [];
  const execSyncMock = (cmd: string, opts: { cwd?: string } = {}) => {
    calls.push({ cmd, opts: { cwd: opts.cwd ?? '' } });
  };
  const deps: BackupDeps = {
    execSync: execSyncMock,
    fs: {
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      statSync: vi.fn(() => ({ size: 2 * 1024 * 1024 }) as never),
    },
  };
  return { deps, calls };
}

describe('backup-system.ts (cross-platform tar with relative path)', () => {
  let env: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    env = makeDeps();
    // silence console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('يستدعي tar بمسار نسبي (full-backups/...) من جذر المشروع وليس بمسار مطلق D:', () => {
    runBackup(env.deps);

    const tarCall = env.calls.find((c) => c.cmd.includes('tar '));
    expect(tarCall).toBeDefined();

    // ① المسار في الأمر نسبي — يبدأ بـ full-backups وليس بجذر مطلق.
    expect(tarCall!.cmd).toMatch(/tar .* -czf "full-backups[/\\][^"]+\.tar\.gz" \./);
    // ② لا يحتوي الأمر على مسار مطلق `D:` أو `C:` في معامل الأرشيف.
    expect(tarCall!.cmd).not.toMatch(/-czf "[A-Za-z]:/);
    // ③ الاستبعادات موجودة (node_modules / .git / full-backups / .env).
    expect(tarCall!.cmd).toContain('node_modules');
    expect(tarCall!.cmd).toContain('.git');
    expect(tarCall!.cmd).toContain('full-backups');
    expect(tarCall!.cmd).toContain('.env');

    // ④ cwd = جذر المشروع — هو ما يجعل المسار النسبي صالحًا على كل المنصات.
    expect(tarCall!.opts.cwd).toBe(rootDir);

    // ⑤ مجلد الأرشيف المستهدف هو full-backups داخل الجذر.
    expect(destinationFolder).toBe(path.join(rootDir, 'full-backups'));
  });

  it('يستدعي سكربت تصدير قاعدة البيانات من داخل backend (cwd: backend)', () => {
    runBackup(env.deps);

    const dbCall = env.calls.find((c) => c.cmd.includes('run-manual-backup'));
    expect(dbCall).toBeDefined();
    expect(dbCall!.opts.cwd).toBe(path.join(rootDir, 'backend'));
  });

  it('المسار النسبي الناتج يقع فعليًا داخل full-backups عند حله من الجذر', () => {
    runBackup(env.deps);

    const tarCall = env.calls.find((c) => c.cmd.includes('tar '))!;
    const match = /-czf "([^"]+)"/.exec(tarCall.cmd);
    expect(match).not.toBeNull();
    // حلّ المسار من cwd يجب أن يطابق مجلد full-backups — أي أن العملية ستنجح على أي منصة.
    const resolved = path.resolve(tarCall.opts.cwd, match![1]);
    expect(path.dirname(resolved)).toBe(destinationFolder);
  });

  it('buildTarCommand يبني أمرًا نسبيًا خاليًا من المسارات المطلقة', () => {
    const cmd = buildTarCommand(['node_modules', '.env'], path.join('full-backups', 'x.tar.gz'));
    expect(cmd).toBe('tar --exclude="node_modules" --exclude=".env" -czf "full-backups\\x.tar.gz" .');
    expect(cmd).not.toMatch(/[A-Za-z]:/);
  });

  it('buildArchiveName يولّد طابعًا زمنيًا آمنًا للملفات على كل المنصات (بلا : أو مسافات)', () => {
    const name = buildArchiveName(new Date('2026-08-15T20:49:06.000Z'));
    expect(name).toMatch(/^AlAgoouz-ERP-Full-Backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(name).not.toMatch(/[: ]/);
  });

  it('ينشئ مجلد full-backups تلقائيًا عندما لا يكون موجودًا', () => {
    const deps = makeDeps().deps;
    deps.fs.existsSync = vi.fn(() => false);
    deps.fs.mkdirSync = vi.fn();

    runBackup(deps);

    expect(deps.fs.mkdirSync).toHaveBeenCalledWith(destinationFolder, { recursive: true });
  });
});

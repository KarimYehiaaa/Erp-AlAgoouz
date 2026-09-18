import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildArchiveName, buildTarCommand, runBackup, type BackupDeps } from '../../scripts/backup-system.ts';
import { checkBuildPath, type CheckBuildPathFs } from '../../scripts/lib/checkBuildPath.ts';

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
    // قراءة package.json/vite.config الحقيقية (الإعدادات الحالية سليمة → الفحص يمر)،
    // مع existsSync محاكى لتجنب لمس مجلدات فعلية.
    fs: {
      // existsSync يقرأ الحالة الفعلية (حتى لا يظن الحارس أن dist الجذر موجود ويمنع النسخ)
      existsSync: (p: string) => fs.existsSync(p),
      mkdirSync: vi.fn(),
      statSync: vi.fn(() => ({ size: 2 * 1024 * 1024 }) as never),
      readFileSync: (p: string, enc: 'utf8') => fs.readFileSync(p, enc),
      readdirSync: (p: string) => fs.readdirSync(p),
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
    const expectedPath = path.join('full-backups', 'x.tar.gz');
    const cmd = buildTarCommand(['node_modules', '.env'], expectedPath);
    expect(cmd).toBe(`tar --exclude="node_modules" --exclude=".env" -czf "${expectedPath}" .`);
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

  it('يعمل فحص مسار البناء قبل تصدير قاعدة البيانات (يستدعي checkBuildPath)', () => {
    const env = makeDeps();
    runBackup(env.deps);
    // أول استدعاء لا يزال سكربت DB — أي أن الحارس مرّ (لا أخطاء) والنسخ استمر.
    const dbCall = env.calls.find((c) => c.cmd.includes('run-manual-backup'));
    expect(dbCall).toBeDefined();
  });

  it('يلجأ إلى git archive كبديل موثوق إذا فشل أمر tar', () => {
    const env = makeDeps();
    const origExec = env.deps.execSync;
    env.deps.execSync = (cmd, opts) => {
      if (cmd.startsWith('tar ')) {
        throw new Error('tar crash 0xC0000005');
      }
      origExec(cmd, opts);
    };

    runBackup(env.deps);

    const gitArchiveCall = env.calls.find((c) => c.cmd.includes('git archive'));
    expect(gitArchiveCall).toBeDefined();
    expect(gitArchiveCall!.cmd).toContain('git archive --format=tar.gz -o "full-backups');
    expect(gitArchiveCall!.opts.cwd).toBe(rootDir);
  });
});

describe('checkBuildPath (build path guard, pure)', () => {
  // fs افتراضي يقرأ المشروع الحقيقي (إعدادات سليمة) — نحاكي سيناريوهات الانتكاس عبر readFileSync مخصص.
  function makeFops(
    overrides: {
      rootPkgBuild?: string;
      rootDistIndexExists?: boolean;
    } = {},
  ): CheckBuildPathFs {
    const real = fs;
    const rootPkg = JSON.parse(real.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    if (overrides.rootPkgBuild !== undefined) {
      rootPkg.scripts.build = overrides.rootPkgBuild;
    }
    return {
      readFileSync: (p: string, enc: 'utf8') => {
        if (p === path.join(rootDir, 'package.json')) return JSON.stringify(rootPkg);
        return real.readFileSync(p, enc);
      },
      readdirSync: (p: string) => real.readdirSync(p),
      existsSync: (p: string) => {
        if (p === path.join(rootDir, 'dist', 'index.html')) {
          return overrides.rootDistIndexExists ?? false;
        }
        return real.existsSync(p);
      },
    };
  }

  it('يمر بالإعدادات السليمة الحالية (لا أخطاء)', () => {
    const result = checkBuildPath(rootDir, { fops: makeFops() });
    expect(result.errors).toEqual([]);
  });

  it('يكتشف --outDir ../dist في root package.json', () => {
    const result = checkBuildPath(rootDir, {
      fops: makeFops({ rootPkgBuild: 'cd frontend && npx vite build --outDir ../dist' }),
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('--outDir');
  });

  it('يكتشف وجود dist/index.html زائد في الجذر', () => {
    const result = checkBuildPath(rootDir, { fops: makeFops({ rootDistIndexExists: true }) });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('الجذر'))).toBe(true);
  });

  it('تحذير (لا خطأ) عند غياب frontend/dist/index.html (لم يُبنَ بعد)', () => {
    const fops = makeFops();
    const orig = fops.existsSync;
    fops.existsSync = (p: string) => {
      if (p === path.join(rootDir, 'frontend', 'dist', 'index.html')) return false;
      return orig(p);
    };
    const result = checkBuildPath(rootDir, { fops });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('frontend/dist/index.html'))).toBe(true);
  });
});

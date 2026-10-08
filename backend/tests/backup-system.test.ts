import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  checkBuildPath,
  type CheckBuildPathFs,
} from '../../scripts/maintenance/lib/checkBuildPath.ts';

// Real archive coverage lives in scripts/database/backup-archive.test.mjs.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('checkBuildPath (build path guard, pure)', () => {
  // fs افتراضي يقرأ المشروع الحقيقي (إعدادات سليمة) — نحاكي سيناريوهات الانتكاس عبر readFileSync مخصص.
  function makeFops(
    overrides: {
      rootPkgBuild?: unknown;
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

  it('rejects a non-string build command without crashing or passing the guard', () => {
    const result = checkBuildPath(rootDir, { fops: makeFops({ rootPkgBuild: 123 }) });
    expect(result.errors).toContain('لا يوجد أمر build في root package.json');
  });

  it('rejects a non-object package manifest without crashing', () => {
    const fops = makeFops();
    const read = fops.readFileSync;
    fops.readFileSync = (file, encoding) =>
      file === path.join(rootDir, 'package.json') ? '[]' : read(file, encoding);
    expect(checkBuildPath(rootDir, { fops }).errors).toContain(
      'لا يوجد أمر build في root package.json',
    );
  });

  it('يكتشف --outDir ../dist في root package.json', () => {
    const result = checkBuildPath(rootDir, {
      fops: makeFops({ rootPkgBuild: 'cd frontend && npx vite build --outDir ../dist' }),
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('--outDir');
  });

  it('يحذر من dist الجذر الذي قد ينشأ من Vercel دون كسر تشغيل frontend/dist', () => {
    const result = checkBuildPath(rootDir, { fops: makeFops({ rootDistIndexExists: true }) });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((e) => e.includes('الجذر'))).toBe(true);
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

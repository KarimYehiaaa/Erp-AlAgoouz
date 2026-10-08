import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pushScript = path.join(repoRoot, 'scripts/windows/Push.bat');

describe('Windows source push helper', () => {
  it('only stages paths that exist in this repository', () => {
    const lines = fs.readFileSync(pushScript, 'utf8').split(/\r?\n/);
    const addLines = lines.filter((line) => /^git add\s/.test(line.trim()));
    expect(addLines.length).toBeGreaterThan(1);

    const missing = addLines
      .flatMap((line) =>
        line
          .trim()
          .replace(/^git add\s+/, '')
          .split(/\s+/),
      )
      .filter((target) => target !== '-u')
      .filter((target) => !fs.existsSync(path.join(repoRoot, target)));
    expect(missing).toEqual([]);
  });

  it('stops before commit or push if any staging command fails', () => {
    const lines = fs.readFileSync(pushScript, 'utf8').split(/\r?\n/);
    const addIndexes = lines.flatMap((line, index) =>
      /^git add\s/.test(line.trim()) ? [index] : [],
    );

    for (const index of addIndexes) {
      expect(lines[index + 1]?.trim()).toBe('if errorlevel 1 goto :failed');
    }
    expect(lines.indexOf('git commit -m "Auto backup: %date% %time%"')).toBeGreaterThan(
      addIndexes.at(-1) ?? 0,
    );
  });
});

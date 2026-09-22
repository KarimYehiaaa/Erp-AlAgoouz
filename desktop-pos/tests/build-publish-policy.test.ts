import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createYargs, configureBuildCommand } = require('electron-builder/out/builder.js');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('installer artifact builds do not publish GitHub releases', () => {
  it('passes one scalar never policy through the actual CI and npm commands', () => {
    const invocation = workflow.match(/npm run electron:build([^\r\n]*)/);
    expect(invocation).not.toBeNull();
    const forwarded = (invocation![1] || '').trim().replace(/^--\s*/, '');
    const builderArgs = pkg.scripts['electron:build'].split('electron-builder')[1].trim();
    const args = `${builderArgs} ${forwarded}`.trim().split(/\s+/);
    const options = configureBuildCommand(createYargs()).parse(args);
    expect(options.publish).toBe('never');
  });
});

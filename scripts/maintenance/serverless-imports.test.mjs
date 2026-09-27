import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const config = ts.readConfigFile(fileURLToPath(new URL('tsconfig.json', root)), ts.sys.readFile);
assert.equal(config.error, undefined);
const options = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, '.').options;

test('serverless entry imports refer to emitted JavaScript files', () => {
  for (const name of ['api/health.ts', 'api/[...slug].ts', 'api/index.ts', 'backend/src/app.ts']) {
    const source = fs.readFileSync(new URL(name, root), 'utf8');
    const emitted = ts.transpileModule(source, { compilerOptions: options }).outputText;
    assert.doesNotMatch(emitted, /(?:from\s*|import\s*)['"][^'"]+\.ts['"]/, name);
  }
});

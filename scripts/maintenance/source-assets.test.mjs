import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('shared source assets contain no stale generated JS or CSS bundles', () => {
  const entries = readdirSync(new URL('../../assets/', import.meta.url), { withFileTypes: true });
  const bundles = entries
    .filter((entry) => entry.isFile() && /-[\w-]{8,}\.(?:js|css)(?:\.map)?$/.test(entry.name))
    .map((entry) => entry.name);
  assert.deepEqual(
    bundles,
    [],
    'Build the frontend into its configured dist directory, not assets/',
  );
  assert.ok(entries.some((entry) => entry.isFile() && entry.name === 'logo.png'));
});

test('web favicon reuses the compact PWA icon and remains under 96 KiB', () => {
  const favicon = readFileSync(new URL('../../frontend/public/favicon.png', import.meta.url));
  const pwaIcon = readFileSync(
    new URL('../../frontend/public/icons/icon-192.png', import.meta.url),
  );
  const html = readFileSync(new URL('../../frontend/index.html', import.meta.url), 'utf8');

  assert.ok(html.includes('href="/favicon.png"'));
  assert.deepEqual(favicon, pwaIcon);
  assert.ok(favicon.byteLength <= 96 * 1024);
});

import { readFile, open, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = await realpath(path.resolve(scriptDirectory, '..'));
const require = createRequire(path.join(desktopRoot, 'package.json'));
const packageEntry = await realpath(require.resolve('http-cache-semantics'));
const allowedRoots = [desktopRoot, path.dirname(desktopRoot)].map((root) =>
  path.join(root, 'node_modules'),
);
if (
  !allowedRoots.some((root) => {
    const relative = path.relative(root, packageEntry);
    return (
      relative &&
      relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative)
    );
  })
) {
  throw new Error(
    'http-cache-semantics resolved outside project dependencies; refusing to modify it.',
  );
}
const packageDirectory = path.dirname(packageEntry);
const metadata = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
const patchMarker =
  '// ERP_SECURITY_PATCH_V3: non-storable, security-zeroed and shared s-maxage responses require revalidation';

if (metadata.version !== '4.3.0') {
  throw new Error(
    `Expected reviewed http-cache-semantics 4.3.0 before applying the local security patch; found ${metadata.version}. Review upstream fixes before changing this guard.`,
  );
}

const input = await readFile(packageEntry, 'utf8');
const source = input.replace(/\r\n/g, '\n');
const staleHeader = '        if (this.stale()) {';
const staleReuse = `            // If a value is present, then the client is willing to accept a response that has
            // exceeded its freshness lifetime by no more than the specified number of seconds
            const allowsStaleWithoutRevalidation = 'max-stale' in requestCC &&
                (true === requestCC['max-stale'] || requestCC['max-stale'] > this.age() - this.maxAge());`;
const rawStaleBranch = `${staleHeader}\n${staleReuse}`;
const patchedStaleBranch = `${staleHeader}
            ${patchMarker}
            const revalidationRequired =
                !this.storable() ||
                this._rescc['no-cache'] ||
                (this._isShared &&
                    (this._rescc['proxy-revalidate'] ||
                        ('s-maxage' in this._rescc) ||
                        (this._resHeaders['set-cookie'] &&
                            !this._rescc.public &&
                            !this._rescc.immutable)));
            if (revalidationRequired) {
                return this._evaluateRequestMissResult(req);
            }

${staleReuse}`;
const rawMustRevalidate = "if (this._rescc['must-revalidate']) {";
const patchedMustRevalidate = "if (this._rescc['must-revalidate'] && this.stale()) {";
// Only the exact reviewed upstream file, or that file with our two edits, is accepted.
// A marker, matching version or partially matching branch cannot approve unknown code.
const reviewed = source
  .replace(patchedStaleBranch, rawStaleBranch)
  .replace(patchedMustRevalidate, rawMustRevalidate);
const reviewedHash = createHash('sha256').update(reviewed).digest('hex');
if (reviewedHash !== 'ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca') {
  throw new Error('Unreviewed http-cache-semantics source; refusing to modify it.');
}
const patched = reviewed
  .replace(rawStaleBranch, patchedStaleBranch)
  .replace(rawMustRevalidate, patchedMustRevalidate);
if (patched === source) {
  process.stdout.write('Verified local http-cache-semantics security patch.\n');
} else {
  const staged = path.join(packageDirectory, `.erp-cache-patch-${process.pid}-${randomUUID()}.tmp`);
  let stageCreated = false;
  let handle;
  try {
    handle = await open(staged, 'wx');
    stageCreated = true;
    await handle.writeFile(patched.replace(/\n/g, input.includes('\r\n') ? '\r\n' : '\n'), 'utf8');
    await handle.close();
    handle = undefined;
    if ((await readFile(packageEntry, 'utf8')) !== input) {
      throw new Error(
        'http-cache-semantics changed during patch preparation; refusing replacement.',
      );
    }
    await rename(staged, packageEntry);
    stageCreated = false;
  } finally {
    try {
      await handle?.close();
    } finally {
      if (stageCreated) await unlink(staged);
    }
  }
  process.stdout.write('Applied local http-cache-semantics security patch.\n');
}

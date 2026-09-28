# System reset — 2026-09-28

The user authorized resetting both the local and online data after reviewing the
preservation scope. Local configuration targets the remote Supabase database;
no separate local business database was found or reset.

## Recovery copy

- Encrypted JSON backup: `backups/backup-2026-09-27T22-38-54-845Z.json`
- Size: 3,438,473 bytes
- SHA-256: `adb5ccfc8355abbde0c4cb32d25c61bc449c8c6a665b20747459bb8e942127f6`
- Decryption and the complete 67-table backup contract were verified before reset.
- Restore requires the same backup encryption key used by the application.

## Verified result

The reset committed one transaction that emptied 54 reviewed business/operational
tables. Every cleared table was checked for zero records immediately afterward.
Saved sales opening balances were removed and document counters restarted.

Exact row comparisons against the backup confirmed preservation of:

| Data | Records | Exact match |
| --- | ---: | --- |
| Products, including prices and costs | 101 | Yes |
| Product categories | 13 | Yes |
| Units | 8 | Yes |
| Recipes | 30 | Yes |
| Recipe ingredients and quantities | 60 | Yes |
| Users | 4 | Yes |
| Warehouses | 2 | Yes |
| Chart of accounts | 44 | Yes |
| POS terminal configuration | 1 | Yes |

A new audit record documents the reset; this is system history rather than a
financial balance or transaction. The local server was started and its health
endpoint confirmed a working database connection.

## Online deployment

The previous deployment failed because `api/health.js` imported the missing
`api/index.ts`. Authorized Vercel log inspection identified `ERR_MODULE_NOT_FOUND`.
Enabling `rewriteRelativeImportExtensions` in the root TypeScript configuration
rewrites relative TypeScript imports to their emitted JavaScript paths.

The isolated release includes only reset, encrypted download, import repair and
their tests. With the user's explicit approval, commits `38a793d` and `cd5562d`
were pushed to `main`. Vercel deployment `DCsFqnC2gV3a8Kg558CZYR9V3vFC` is Ready
on `agoouz.vercel.app`; its health endpoint returned HTTP 200 with `success: true`
and `db.connected: true`.

Authenticated online catalog and button verification is pending the user's ERP
admin login. The exact deployed database target is not yet confirmed. The
Supabase reset must not be repeated to perform this remaining verification.

## Implementation checks

- Backend and frontend type checks passed.
- Frontend production build passed.
- Targeted backup/accounting tests: 26 passed.
- The full reset and encrypted-download integration test passed on an ephemeral
  local database built from all migrations; that database was removed afterward.
- The isolated release also passed its type checks, frontend build, emitted-import
  regression test and reset integration test on a disposable local database.
- Reset uses `RESTRICT` with a reviewed table contract and rolls back on unknown
  tables/dependencies. It preserves the product and recipe tables and avoids
  disabling database integrity checks.

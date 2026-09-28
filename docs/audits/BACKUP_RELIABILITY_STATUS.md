# Backup reliability verification

The manual and automatic JSON backup paths share one explicit table contract and a
read-only REPEATABLE READ snapshot. The contract includes accounting, POS shifts,
bank reconciliation, purchasing, partners, menus and automation data.

An incomplete backup is rejected before opening the restore transaction. Restore
uses one RESTRICT truncate statement rather than cascading into tables absent
from the backup contract. Old partial backups require a separate recovery process;
they must not replace a live database through the full-restore endpoint.

Verified locally:

- Both backup paths create encrypted files whose decrypted table sets match the contract.
- The contract matches application tables in the migrated local PostgreSQL database.
- Rejecting an incomplete backup leaves existing account records unchanged.
- Targeted backup/schema tests: 10 passed, including inspection of the encrypted cloud upload.
- A full restore drill passed on `bin_al_ajouz_restore_test`, created locally from migrations.
  Every table's records matched before and after restoration, including a draft journal with
  two lines, a POS shift with a cash movement, and a JSONB array in workflow settings.
- The drill caught and fixed JSONB array serialization during restore, and is now included
  in CI using a dedicated database. It is skipped in ordinary shared-database test runs.
- The drill reproduced a journal counter returning 1002 after restoring a much higher
  document number. Restore now advances all nine document counters using the numeric
  suffix in document numbers and preserves a higher existing sequence value.
  The journal-counter regression passes after the fix.
- Cloud uploads encrypt raw snapshots at the upload boundary, while preserving already
  encrypted backup envelopes. Upload payload verification uses a mocked transport.
- A production movement followed by a product primary-warehouse change is included in
  the restore drill. Restore preserves the historical destination rather than rewriting it
  to the current warehouse. The previous restore code failed this exact-record comparison.

Still required before declaring disaster recovery ready:

- Add richer backup/restore fixtures for sales, purchases, expenses, payments, returns and
  reconciliation documents; only one journal entry inside a closed period is currently proven.
- Verify production backup storage, retention and off-site retrieval; a successful HTTP health
  response does not establish any of these guarantees.

Additional relational-integrity verification (2026-09-25):

- The disposable restore drill adds a composite `MATCH FULL` relationship between products
  and product categories, then verifies that a missing composite parent and a partially-null
  key are both rejected before commit. After each rejected restore, every table remains
  identical to the known-good snapshot. The targeted roundtrip passes locally on an ephemeral
  PostgreSQL database that the test runner removes after completion.
- The same drill restores a closed July 2025 accounting period containing a dated journal entry
  and verifies both its closed status and journal date after restore.

Restore input hardening verified locally:

- Malformed JSON, non-object/empty rows, invalid column identifiers and inconsistent row
  column sets are rejected before acquiring a database connection (mocked boundary tests).
- Replication-role permission failure immediately rolls back restore. The system reset no
  longer changes the replication role: it clears one reviewed table list with `RESTRICT`
  in a transaction and aborts if the schema contains an unreviewed table or dependency.
- The full restore drill on the disposable database still passes after this validation.
- Restore checks declared foreign keys using PostgreSQL catalog definitions before resetting
  counters or committing. An encrypted snapshot containing an orphan stock movement is rejected
  with HTTP 400; every table matches its pre-attempt data after rollback. The valid snapshot
  remains restorable. Combined restore/validation tests: 11 passed locally.

Historical migrations are retained because they reconstruct the schema. They are not
duplicate runtime implementations and must not be deleted as obsolete code.

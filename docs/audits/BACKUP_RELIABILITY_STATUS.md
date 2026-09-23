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

- Verify closed accounting periods and all document families with richer financial fixtures.
- Verify production backup storage, retention and off-site retrieval; a successful HTTP health
  response does not establish any of these guarantees.
- Extend relational-integrity fixtures to composite foreign keys and MATCH FULL null cases;
  the implemented validator reads those definitions, but the restore drill currently proves
  a missing product reference and preservation of the valid snapshot.

Restore input hardening verified locally:

- Malformed JSON, non-object/empty rows, invalid column identifiers and inconsistent row
  column sets are rejected before acquiring a database connection (mocked boundary tests).
- Replication-role permission failure immediately rolls back restore/reset; neither proceeds
  to truncate tables after the failed statement. Ten regression cases passed.
- The full restore drill on the disposable database still passes after this validation.
- Restore checks declared foreign keys using PostgreSQL catalog definitions before resetting
  counters or committing. An encrypted snapshot containing an orphan stock movement is rejected
  with HTTP 400; every table matches its pre-attempt data after rollback. The valid snapshot
  remains restorable. Combined restore/validation tests: 11 passed locally.

Historical migrations are retained because they reconstruct the schema. They are not
duplicate runtime implementations and must not be deleted as obsolete code.

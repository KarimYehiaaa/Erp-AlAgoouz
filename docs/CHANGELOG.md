# Changelog

## Unreleased

- fix(inventory): Ensure inventory rows exist and are locked before updates
  - Added `backend/src/services/inventoryService.ts` with `lockInventoryRow` and `ensureInventoryRow` helpers.
  - Updated `backend/src/services/salesService.ts` and `backend/src/services/recipesService.ts` to use the helpers and avoid missing-row race conditions.
  - Updated `backend/src/services/inventoryService.ts` to use the locking helpers for transfers/adjustments.
  - Added integration tests for the inventory helpers under `backend/tests/`.
- ci: Add GitHub Actions workflow to run backend tests on push/PR
  - Added `.github/workflows/ci.yml`.

### Notes

- All backend tests pass locally (`npm test` -> 8 passed).
- CI runs automatically on pushes to the main branch and pull requests.

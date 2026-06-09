# Changelog

## Unreleased

- fix(inventory): Ensure inventory rows exist and are locked before updates
  - Added `backend/src/services/inventoryService.js` with `lockInventoryRow` and `ensureInventoryRow` helpers.
  - Updated `backend/src/services/salesService.js` and `backend/src/services/recipesService.js` to use the helpers and avoid missing-row race conditions.
  - Updated `backend/src/services/inventoryService.js` to use the locking helpers for transfers/adjustments.
  - Added integration tests for the inventory helpers: `backend/test/inventory-integration.test.js`.
- ci: Add GitHub Actions workflow to run backend tests on push/PR
  - Added `.github/workflows/ci.yml`.

### Notes

- All backend tests pass locally (`npm test` -> 8 passed).
- Recommended: push branch `fix/inventory-locks` and open a PR so CI runs.

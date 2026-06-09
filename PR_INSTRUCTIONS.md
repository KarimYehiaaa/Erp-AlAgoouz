# Push & PR Instructions

Run these commands locally to push the fixes and open a PR.

1. Create a feature branch and commit your changes:

```bash
git checkout -b fix/inventory-locks
git add -A
git commit -m "fix(inventory): ensure and lock inventory rows before updates; use inventoryService across services"
```

2. Push the branch to origin:

```bash
git push -u origin fix/inventory-locks
```

3. Create a PR (optional, using GitHub CLI):

```bash
gh pr create --fill --title "fix: ensure inventory rows + locking" --body "Adds inventoryService and uses row locking/creation to avoid missing inventory rows and race conditions. Runs backend tests on CI."
```

4. CI will run automatically via GitHub Actions (`.github/workflows/ci.yml`).

5. If you don't have `gh` installed, open a PR via the repository web UI and reference the branch.

6. Recommended local checks before pushing:

```bash
cd backend
npm ci
npm test
```

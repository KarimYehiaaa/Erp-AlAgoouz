# Push & PR Instructions

Run these commands locally to validate and publish a change.

1. Create a branch using the repository convention and commit your changes:

```bash
git checkout -b codex/<short-change-name>
git add -A
git commit -m "fix(inventory): ensure and lock inventory rows before updates; use inventoryService across services"
```

2. Push the branch to origin:

```bash
git push -u origin codex/<short-change-name>
```

3. Create a PR (optional, using GitHub CLI):

```bash
gh pr create --fill
```

4. CI will run automatically via GitHub Actions (`.github/workflows/ci.yml`).

5. If you don't have `gh` installed, open a PR via the repository web UI and reference the branch.

6. Recommended local checks before pushing:

```bash
cd backend
npm ci
npm test
```

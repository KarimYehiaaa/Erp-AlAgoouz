# Project Guardian V1

Project Guardian is the project-health observer for Bin Al-Ajouz ERP. It is intentionally separate from business automations such as sales, inventory and accounting alerts.

## What V1 monitors

- pushes to `main`
- completion/failure of the main CI/CD workflow
- GitHub deployment status
- backend runtime 5xx errors
- recurrence of a previously resolved incident

Every signal is stored in `project_guardian_events`. Failure-like signals are also deduplicated into `project_guardian_incidents` using a SHA-256 fingerprint. If a resolved fingerprint appears again, the incident is reopened and `reopened_count` increases.

## Safety model

V1 is observer-only. It cannot merge code, mutate `main`, run database repair actions, or deploy fixes. Future repair automation must use an isolated branch + PR + CI verification and keep human approval for high-risk domains.

## Required secret

Configure the same long random value in the server environment and GitHub Actions secret:

`PROJECT_GUARDIAN_SECRET`

Optional GitHub repository variable:

`PROJECT_GUARDIAN_ENDPOINT`

Default: `https://agoouz.vercel.app/api/v1/guardian/events`

## API

Machine ingestion:
- `POST /api/v1/guardian/events`
- header: `x-project-guardian-secret`

Admin/read:
- `GET /api/v1/guardian/summary`
- `GET /api/v1/guardian/incidents?status=open&limit=50&offset=0`
- `PATCH /api/v1/guardian/incidents/:id/status`

Read endpoints reuse `automation.view`; incident management reuses `automation.manage`.

Lifecycle:

`open -> investigating -> fix_ready -> resolved`

`ignored` is available for a known signal requiring no action.

## Next phase

Add an Investigator that consumes open incidents, maps affected files and dependencies, proposes root cause and repair plan, creates an isolated branch, runs the existing CI suite, and opens a PR. It must not auto-merge.

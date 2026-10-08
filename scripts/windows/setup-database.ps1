# DATABASE_URL and local credentials are read by the shared backend setup.
# For first-time native PostgreSQL provisioning, set POSTGRES_PASSWORD securely
# in the calling session; an existing shared database does not need that password.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
$setupExitCode = 1
Push-Location -LiteralPath $Root
try {
    npm run setup-db -w backend
    $setupExitCode = $LASTEXITCODE
    if ($setupExitCode -eq 0) {
        Write-Host "Database setup completed. Run npm run dev -w backend from the project root." -ForegroundColor Green
    }
} finally {
    Pop-Location
}
exit $setupExitCode

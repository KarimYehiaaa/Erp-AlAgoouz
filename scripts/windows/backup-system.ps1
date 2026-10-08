# Use the verified archive pipeline on every platform.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
$backupExitCode = 1
Push-Location -LiteralPath $Root
try {
    npm run backup
    $backupExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $backupExitCode

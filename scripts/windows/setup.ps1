# Use the shared setup wizard so Windows and other platforms follow the same steps.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
$setupExitCode = 1
Push-Location -LiteralPath $Root
try {
    npm run setup
    $setupExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $setupExitCode

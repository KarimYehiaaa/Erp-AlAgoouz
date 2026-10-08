# Legacy entry point retained for existing instructions.
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
& (Join-Path $root "system.ps1") start
exit $LASTEXITCODE

# Legacy entry point retained for existing instructions. Startup now uses the
# single NSSM service so a scheduled task cannot launch a competing API process.
$installer = Join-Path $PSScriptRoot "install-services.ps1"
& $installer
exit $LASTEXITCODE

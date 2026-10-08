# Legacy entry point retained for existing instructions. Use the unified
# service installer instead of creating a second PM2 logon task.
$installer = Join-Path $PSScriptRoot "install-services.ps1"
& $installer
exit $LASTEXITCODE

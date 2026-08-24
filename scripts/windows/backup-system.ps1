# ==============================================================================
# AlAgoouz ERP - Full System Backup Script
# ==============================================================================

# Set encoding to UTF8 for proper Arabic text display in terminal
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# اشتقاق مجلد المشروع تلقائياً من موقع هذا السكربت (scripts\windows\ ← مستويان للأعلى)
$rootFolder = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$destinationFolder = "$rootFolder\full-backups"

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host '   AlAgoouz ERP - Full System Backup              ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

# 1. Generate the latest database dump
Write-Host '1. Exporting database to JSON...' -ForegroundColor Yellow
cd "$rootFolder\backend"

$backupOutput = node scripts/run-backup-cli.ts

if ($LASTEXITCODE -ne 0 -or !$backupOutput.StartsWith('SUCCESS:')) {
    Write-Host 'ERROR: Database backup failed!' -ForegroundColor Red
    Exit 1
}

$dbBackupFile = $backupOutput.Substring(8).Trim()
Write-Host "SUCCESS: Database exported: $dbBackupFile" -ForegroundColor Green

# 2. Prepare archiving directories
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$archiveName = "AlAgoouz-ERP-Full-Backup-$timestamp"
$tempPath = "$env:TEMP\$archiveName"

Write-Host '2. Copying system files (code + configs + data)...' -ForegroundColor Yellow

# Create temp path and full-backups folder
If (!(Test-Path $destinationFolder)) {
    New-Item -ItemType Directory -Force -Path $destinationFolder | Out-Null
}
New-Item -ItemType Directory -Force -Path $tempPath | Out-Null

# Use robocopy to replicate folders excluding node_modules, .git, and previous full-backups
robocopy "$rootFolder" "$tempPath" /E /XD 'node_modules' '.git' 'full-backups' '.kiro' "$rootFolder\backups" /XF '*.log' /NFL /NDL /NJH /NJS | Out-Null

# 3. Compress the folder into a zip archive
Write-Host '3. Compressing files to ZIP archive...' -ForegroundColor Yellow
$zipPath = "$destinationFolder\$archiveName.zip"
Compress-Archive -Path "$tempPath\*" -DestinationPath $zipPath -Force

# 4. Cleanup
Remove-Item -Path $tempPath -Recurse -Force | Out-Null

# Calculate archive size
$archiveSize = (Get-Item $zipPath).Length / 1MB
$archiveSizeFormatted = '{0:N2}' -f $archiveSize

Write-Host '==================================================' -ForegroundColor Green
Write-Host 'SUCCESS: Full backup completed successfully!' -ForegroundColor Green
Write-Host "Saved to: $zipPath" -ForegroundColor Green
Write-Host "Archive Size: $archiveSizeFormatted MB" -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green

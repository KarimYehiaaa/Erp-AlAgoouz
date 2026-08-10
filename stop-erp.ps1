# ============================================================
# سكربت تنظيف عمليات بن العجوز ERP اليتيمة
# الاستخدام: .\stop-erp.ps1
# ============================================================

Write-Host ""
Write-Host "=== بن العجوز ERP — تنظيف العمليات ===" -ForegroundColor Cyan
Write-Host ""

# 1. إيقاف PM2 إذا كان يعمل
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    Write-Host "[1/4] إيقاف PM2..." -ForegroundColor Yellow
    pm2 stop all 2>$null
    pm2 kill 2>$null
    Write-Host "  ✅ PM2 متوقف" -ForegroundColor Green
} else {
    Write-Host "[1/4] PM2 غير مثبت — تخطي" -ForegroundColor DarkGray
}

# 2. قتل عمليات Node المتعلقة بالمشروع
Write-Host "[2/4] البحث عن عمليات Node المتعلقة بالمشروع..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
$killed = 0

if ($nodeProcesses) {
    foreach ($proc in $nodeProcesses) {
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmdLine -and ($cmdLine -match "AlAgoouz" -or $cmdLine -match "bin-al-ajouz" -or $cmdLine -match "backend" -or $cmdLine -match "frontend" -or $cmdLine -match "vite" -or $cmdLine -match "pm2")) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  ✅ قتل PID $($proc.Id): $($cmdLine.Substring(0, [Math]::Min(80, $cmdLine.Length)))..." -ForegroundColor Green
                $killed++
            }
        } catch {
            # تخطي العمليات المحمية
        }
    }
}

if ($killed -eq 0) {
    Write-Host "  ℹ️ لا توجد عمليات ERP نشطة" -ForegroundColor DarkGray
} else {
    Write-Host "  🗑️ تم قتل $killed عملية" -ForegroundColor Green
}

# 3. التحقق من المنافذ
Write-Host "[3/4] فحص المنافذ..." -ForegroundColor Yellow
$ports = @(3000, 3443, 5173)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            try {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "  ✅ تحرير المنفذ $port (PID: $($c.OwningProcess))" -ForegroundColor Green
            } catch {}
        }
    } else {
        Write-Host "  ✅ المنفذ $port حر" -ForegroundColor DarkGray
    }
}

# 4. ملخص
Write-Host ""
Write-Host "[4/4] ✅ تم التنظيف بنجاح!" -ForegroundColor Green
Write-Host "  يمكنك الآن تشغيل النظام:" -ForegroundColor White
Write-Host "    Backend:  npm run start   (أو npm run dev من مجلد backend)" -ForegroundColor White
Write-Host "    Frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host ""

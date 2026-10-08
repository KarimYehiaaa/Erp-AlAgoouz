param(
    [string]$AndroidSdkPath = '',
    [ValidateSet('Debug', 'Release')][string]$BuildType = 'Release',
    [ValidateRange(1, 8)][int]$GradleWorkers = 2,
    [ValidateRange(512, 8192)][int]$GradleHeapMiB = 1536
)
$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$androidDir = Join-Path $rootDir 'frontend\android'
$localProp = Join-Path $androidDir 'local.properties'
$originalProperties = if (Test-Path -LiteralPath $localProp) { [System.IO.File]::ReadAllBytes($localProp) } else { $null }
$originalLocation = Get-Location
$temporaryFiles = @()
$originalEnvironment = @{}
foreach ($environmentName in @('ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ALAGOOUZ_RELEASE_WRAPPER', 'VITE_ANDROID_BUILD_TYPE')) {
    $originalEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName)
}
if ($BuildType -eq 'Release') {
    foreach ($requiredName in @('ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'ANDROID_SIGNING_LINEAGE_PATH')) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($requiredName))) {
            throw 'Release signing requires explicitly provisioned ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD and ANDROID_SIGNING_LINEAGE_PATH. Never commit signing keys or passwords.'
        }
    }
    foreach ($requiredFile in @($env:ANDROID_KEYSTORE_PATH, $env:ANDROID_SIGNING_LINEAGE_PATH)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) { throw 'The explicitly configured signing key or lineage file is unavailable.' }
    }
}
$existingSdk = ''
if (Test-Path -LiteralPath $localProp) {
    $sdkLine = Get-Content -LiteralPath $localProp | Where-Object { $_ -match '^sdk\.dir=' } | Select-Object -First 1
    if ($sdkLine) {
        $existingSdk = [regex]::Replace($sdkLine.Substring(8), '\\u([0-9a-fA-F]{4})|\\(.)', {
            param($match)
            if ($match.Groups[1].Success) { return [string][char][Convert]::ToInt32($match.Groups[1].Value, 16) }
            switch ($match.Groups[2].Value) {
                't' { return "`t" }
                'n' { return "`n" }
                'r' { return "`r" }
                'f' { return "`f" }
                default { return $match.Groups[2].Value }
            }
        })
    }
}
$sdkCandidates = @($AndroidSdkPath, $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, $existingSdk)
if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $sdkCandidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$sdkPath = $sdkCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -First 1
if (-not $sdkPath) { throw 'Android SDK unavailable. Set ANDROID_HOME or pass -AndroidSdkPath. Existing local.properties was preserved.' }
$sdkPath = (Resolve-Path -LiteralPath $sdkPath).Path
try {
    $env:ANDROID_HOME = $sdkPath
    $env:ANDROID_SDK_ROOT = $sdkPath
    $escapedSdk = $sdkPath.Replace('\', '\\').Replace(':', '\:')
    $propertyLines = if (Test-Path -LiteralPath $localProp) { @(Get-Content -LiteralPath $localProp | Where-Object { $_ -notmatch '^sdk\.dir=' }) } else { @() }
    # Java properties require Unicode escapes when written as ASCII. This also
    # supports SDK installations under non-English Windows user directories.
    $encodedLines = @($propertyLines + "sdk.dir=$escapedSdk") | ForEach-Object {
        [regex]::Replace($_, '[^\u0000-\u007F]', { param($match) '\u{0:x4}' -f [int][char]$match.Value })
    }
    Set-Content -LiteralPath $localProp -Value $encodedLines -Encoding ascii
    if ($BuildType -eq 'Release') {
        $env:ALAGOOUZ_RELEASE_WRAPPER = 'true'
    }
    Set-Location -LiteralPath $rootDir
    $env:VITE_ANDROID_BUILD_TYPE = $BuildType
    npm.cmd run cap:build --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Native frontend build or Capacitor sync failed.' }
    Set-Location -LiteralPath $androidDir
    & '.\gradlew.bat' "assemble$BuildType" --no-daemon "--max-workers=$GradleWorkers" "-Dorg.gradle.jvmargs=-Xmx${GradleHeapMiB}m"
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed. No previous APK will be copied.' }
    $variant = $BuildType.ToLowerInvariant()
    $outputDir = Join-Path $androidDir "app\build\outputs\apk\$variant"
    if ($BuildType -eq 'Release') {
        $unsignedApk = Join-Path $outputDir 'app-release-unsigned.apk'
        if (-not (Test-Path -LiteralPath $unsignedApk)) { throw 'The unsigned release APK was not produced.' }
        $buildTools = Get-ChildItem -LiteralPath (Join-Path $sdkPath 'build-tools') -Directory |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
        if (-not $buildTools) { throw 'Stable Android SDK build-tools are unavailable.' }
        $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
        if (-not (Test-Path -LiteralPath $apksigner)) { throw 'Android apksigner is unavailable.' }
        $signedTemporaryApk = Join-Path $outputDir "app-release-$([guid]::NewGuid().ToString('N')).apk"
        $temporaryFiles += $signedTemporaryApk
        $inspector = Join-Path $rootDir 'scripts\deployment\AndroidReleaseInspector.java'
        $apksigJar = Join-Path $buildTools.FullName 'lib\apksigner.jar'
        $preparedLineage = Join-Path $outputDir "app-release-lineage-$([guid]::NewGuid().ToString('N')).bin"
        $temporaryFiles += $preparedLineage
        & java --class-path $apksigJar $inspector --prepare-lineage $env:ANDROID_SIGNING_LINEAGE_PATH $preparedLineage
        if ($LASTEXITCODE -ne 0) { throw 'The legacy-to-current release signing lineage is invalid.' }
        & $apksigner sign --ks $env:ANDROID_KEYSTORE_PATH --ks-key-alias $env:ANDROID_KEY_ALIAS --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD --lineage $preparedLineage --v1-signing-enabled false --v2-signing-enabled false --v3-signing-enabled true --v4-signing-enabled false --in $unsignedApk --out $signedTemporaryApk
        if ($LASTEXITCODE -ne 0) { throw 'Current-key APK signing failed.' }
        $signerOutput = Join-Path $outputDir "app-release-signing-$([guid]::NewGuid().ToString('N')).txt"
        $temporaryFiles += $signerOutput
        $verificationOutput = & $apksigner verify --verbose --print-certs --min-sdk-version 33 -Werr $signedTemporaryApk 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Android 13+ APK signature verification failed.' }

        Set-Content -LiteralPath $signerOutput -Value $verificationOutput -Encoding utf8
        $inspectionOutput = Join-Path $outputDir "app-release-inspection-$([guid]::NewGuid().ToString('N')).json"
        $badgingOutput = Join-Path $outputDir "app-release-badging-$([guid]::NewGuid().ToString('N')).txt"
        $temporaryFiles += @($inspectionOutput, $badgingOutput)
        $inspection = & java --class-path $apksigJar $inspector $signedTemporaryApk | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Native APK signature and lineage inspection failed.' }
        Set-Content -LiteralPath $inspectionOutput -Value $inspection -Encoding utf8
        $aapt2 = Join-Path $buildTools.FullName 'aapt2.exe'
        $badging = & $aapt2 dump badging $signedTemporaryApk | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Native APK package metadata inspection failed.' }
        Set-Content -LiteralPath $badgingOutput -Value $badging -Encoding utf8
        $apkSrc = $signedTemporaryApk
    } else {
        $apkSrc = Join-Path $outputDir "app-$variant.apk"
    }
    if (-not (Test-Path -LiteralPath $apkSrc)) { throw 'The requested APK was not produced.' }
    $apkDst = Join-Path $rootDir "BinAlAgoouz-Manager-$BuildType.apk"
    if ($BuildType -eq 'Release') {
        $copyId = [guid]::NewGuid().ToString('N')
        $apkTemporary = "$apkDst.$copyId.tmp"
        $manifestTemporary = "$apkDst.manifest.json.$copyId.tmp"
        $temporaryFiles += @($apkTemporary, $manifestTemporary)
        Copy-Item -LiteralPath $apkSrc -Destination $apkTemporary
        $verifier = Join-Path $rootDir 'scripts\deployment\verify-android-release.mjs'
        & node $verifier --apk $apkTemporary --signer-output $signerOutput --inspection $inspectionOutput --badging $badgingOutput --manifest $manifestTemporary --artifact-name (Split-Path -Leaf $apkDst)
        if ($LASTEXITCODE -ne 0) { throw 'Release APK did not match the installed Android signer or could not produce its integrity manifest.' }
        $publisher = Join-Path $rootDir 'scripts\deployment\publish-android-release.mjs'
        & node $publisher $apkTemporary $manifestTemporary $apkDst (Join-Path $rootDir 'backups')
        if ($LASTEXITCODE -ne 0) { throw 'Release APK publication failed; the previous APK and manifest were retained or rolled back.' }
    } else {
        Copy-Item -LiteralPath $apkSrc -Destination $apkDst -Force
    }
    Write-Host "APK generated: $apkDst"
} finally {
    try {
        foreach ($temporaryFile in $temporaryFiles) {
            if (Test-Path -LiteralPath $temporaryFile) { Remove-Item -LiteralPath $temporaryFile -Force }
        }
    } finally {
        try {
            if ($null -ne $originalProperties) {
                [System.IO.File]::WriteAllBytes($localProp, [byte[]]$originalProperties)
            } elseif (Test-Path -LiteralPath $localProp) {
                Remove-Item -LiteralPath $localProp -Force
            }
        } finally {
            Set-Location -LiteralPath $originalLocation.Path
            foreach ($environmentName in $originalEnvironment.Keys) {
                [Environment]::SetEnvironmentVariable($environmentName, $originalEnvironment[$environmentName])
            }
        }
    }
}

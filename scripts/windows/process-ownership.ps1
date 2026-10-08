# Pure ownership/argument helpers shared by Windows runtime entry points.
# Parse Windows quoting using the OS API; never evaluate a command line as code.
function ConvertFrom-ErpWindowsCommandLine {
    param([string]$CommandLine)
    if (-not $CommandLine) { return @() }
    if (-not ('ErpRuntime.CommandArguments' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace ErpRuntime {
  public static class CommandArguments {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CommandLineToArgvW(string command, out int count);
    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr memory);
    public static string[] Parse(string command) {
      int count;
      IntPtr memory = CommandLineToArgvW(command, out count);
      if (memory == IntPtr.Zero) throw new InvalidOperationException("Command arguments could not be parsed.");
      try {
        string[] values = new string[count];
        for (int i=0; i<count; i++) values[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size));
        return values;
      } finally { LocalFree(memory); }
    }
  }
}
'@
    }
    return [ErpRuntime.CommandArguments]::Parse($CommandLine.TrimStart())
}

function Test-ErpPathOwned {
    param([string]$ProjectRoot, [string]$Path)
    if (-not $Path -or -not [IO.Path]::IsPathRooted($Path)) { return $false }
    try {
        $boundary = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
        return [IO.Path]::GetFullPath($Path).StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)
    } catch { return $false }
}

function Get-ErpNodeEntry {
    param([string[]]$Tokens, [string]$Directory = '')
    for ($index=0; $index -lt $Tokens.Count; $index++) {
        $token = $Tokens[$index]
        if ($token -match '^(?:-e|-p|--eval|--print)(?:$|=)') { return '' }
        if ($token -in @('--import','--require','-r','--loader','--experimental-loader','--title','--conditions','-C','--env-file','--env-file-if-exists','--redirect-warnings','--watch-path','--watch-kill-signal','--disable-warning')) {
            if ($index + 1 -ge $Tokens.Count) { return '' }
            $index++; continue
        }
        if ($token -eq '--') { if ($index + 1 -ge $Tokens.Count) { return '' }; $token = $Tokens[++$index] }
        elseif ($token.StartsWith('-')) {
            # Unknown flags may consume the next token: never mistake an option value for the script.
            if ($token -match '^--[^=]+=.*$' -or $token -in @('--watch','--watch-preserve-output','--enable-source-maps','--no-warnings','--trace-warnings','--inspect','--inspect-brk','--inspect-wait','--no-deprecation','--trace-deprecation','--trace-uncaught','--abort-on-uncaught-exception','--experimental-strip-types','--experimental-transform-types')) { continue }
            return ''
        }
        try {
            if ([IO.Path]::IsPathRooted($token)) { return [IO.Path]::GetFullPath($token) }
            if ($Directory -and [IO.Path]::IsPathRooted($Directory)) { return [IO.Path]::GetFullPath((Join-Path $Directory $token)) }
        } catch { }
        return ''
    }
    return ''
}

function Test-ErpOwnedCommand {
    param([string]$ProjectRoot, [string]$Directory, [string]$Command, [string]$Arguments)
    $directoryOwned = $Directory -and (Test-ErpPathOwned $ProjectRoot (([IO.Path]::GetFullPath($Directory)).TrimEnd('\') + '\boundary'))
    $tokens = @(ConvertFrom-ErpWindowsCommandLine ('placeholder.exe ' + $Arguments) | Select-Object -Skip 1)
    $leaf = [IO.Path]::GetFileName($Command.Trim('"')).ToLowerInvariant()
    if ($leaf -in @('node.exe','node')) {
        $entry = Get-ErpNodeEntry $tokens $(if ($directoryOwned) { $Directory } else { '' })
        return Test-ErpPathOwned $ProjectRoot $entry
    }
    if ($leaf -in @('pm2.ps1','pm2.cmd')) {
        if ($tokens.Count -eq 1 -and $tokens[0] -eq 'resurrect') { return [bool]$directoryOwned }
        if ($tokens.Count -lt 2 -or $tokens[0] -ne 'start') { return $false }
        $entry = $tokens[1]
        if (-not [IO.Path]::IsPathRooted($entry) -and $directoryOwned) { $entry = Join-Path $Directory $entry }
        return Test-ErpPathOwned $ProjectRoot $entry
    }
    if ($leaf -in @('wscript.exe','cscript.exe')) {
        $entry = $tokens | Where-Object { -not $_.StartsWith('//') } | Select-Object -First 1
        return (Test-ErpPathOwned $ProjectRoot $entry) -and $entry -match '\.(vbs|js)$'
    }
    if ($leaf -in @('powershell.exe','pwsh.exe')) {
        if (@($tokens | Where-Object { $_ -match '^-(?:c|command|enc|encodedcommand)$' }).Count -gt 0) { return $false }
        for ($index=0; $index -lt $tokens.Count - 1; $index++) {
            if ($tokens[$index] -eq '-File') { return (Test-ErpPathOwned $ProjectRoot $tokens[$index + 1]) -and $tokens[$index + 1] -match '\.ps1$' }
        }
        return $false
    }
    if ($leaf -eq 'cmd.exe') {
        return $tokens.Count -ge 2 -and $tokens[0] -eq '/c' -and (Test-ErpPathOwned $ProjectRoot $tokens[1]) -and $tokens[1] -match '\.(cmd|bat)$'
    }
    return Test-ErpPathOwned $ProjectRoot $Command.Trim('"')
}

function Test-ErpRuntimeProcess {
    param([string]$ProjectRoot, $Process, [switch]$BackendOnly)
    if (-not $Process -or $Process.Name -ne 'node.exe') { return $false }
    $tokens = @(ConvertFrom-ErpWindowsCommandLine ([string]$Process.CommandLine))
    if ($tokens.Count -lt 2 -or [IO.Path]::GetFileName($tokens[0]).ToLowerInvariant() -notin @('node','node.exe')) { return $false }
    $entry = Get-ErpNodeEntry @($tokens | Select-Object -Skip 1)
    if (-not (Test-ErpPathOwned $ProjectRoot $entry)) { return $false }
    $targets = @('backend\src\index.ts','backend\src\index.js')
    if (-not $BackendOnly) { $targets += @('frontend\node_modules\vite\bin\vite.js','node_modules\vite\bin\vite.js') }
    foreach ($target in $targets) {
        if ($entry.Equals([IO.Path]::GetFullPath((Join-Path $ProjectRoot $target)), [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function ConvertTo-ErpNativeArguments {
    param([string[]]$Arguments)
    return (($Arguments | ForEach-Object {
        '"' + [regex]::Replace([regex]::Replace($_, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
    }) -join ' ')
}

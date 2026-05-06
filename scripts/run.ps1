#requires -Version 5.0
#
# scripts/run.ps1 — one-command setup + launch.
#
# Idempotent: skips work that's already done.
#   1. npm install        (if node_modules missing)
#   2. neu update         (if bin/neutralino-win_x64.exe missing)
#   3. build shellhelp.exe (if missing or older than tools/shellhelp.cpp)
#                          — needs MSVC `cl`. Skipped with warning if absent.
#   4. neu run            (start the app)
#
# Usage from any cwd:
#   powershell -ExecutionPolicy Bypass -File scripts\run.ps1
# Or via npm:
#   npm start

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Has-Cmd($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Has-Cmd node)) {
    Write-Error "Node.js not found on PATH. Install from https://nodejs.org and retry."
}

if (-not (Test-Path 'node_modules/.bin/neu.cmd') -and -not (Test-Path 'node_modules/.bin/neu')) {
    Write-Host "==> npm install"
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path 'bin/neutralino-win_x64.exe')) {
    Write-Host "==> neu update (downloading Neutralino runtime, ~50 MB once)"
    npm run setup
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$exe = 'extras/shellhelp.exe'
$src = 'tools/shellhelp.cpp'
$needsBuild = $false
if (-not (Test-Path $exe)) {
    $needsBuild = $true
} elseif ((Get-Item $src).LastWriteTime -gt (Get-Item $exe).LastWriteTime) {
    $needsBuild = $true
}

if ($needsBuild) {
    if (Has-Cmd cl) {
        Write-Host "==> building extras/shellhelp.exe"
        New-Item -ItemType Directory -Force -Path extras | Out-Null
        Push-Location tools
        try {
            & cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp /link shell32.lib ole32.lib
            $rc = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($rc -eq 0) {
            Move-Item -Force tools/shellhelp.exe extras/shellhelp.exe
            Remove-Item tools/shellhelp.obj -ErrorAction SilentlyContinue
        } else {
            Write-Warning "shellhelp.exe build failed (cl exit $rc). Right-click actions will use the PowerShell fallback (~250-400 ms)."
        }
    } else {
        Write-Warning "MSVC 'cl' not on PATH; skipping shellhelp.exe build. Right-click actions will use the PowerShell fallback (~250-400 ms). To build: open 'x64 Native Tools Command Prompt for VS' and re-run this script. See tools/build.md."
    }
}

Write-Host "==> neu run"
npm run dev

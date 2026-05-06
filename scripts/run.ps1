#requires -Version 5.0
#
# scripts/run.ps1 - one-command setup + launch.
#
# Idempotent: skips work that's already done.
#   1. npm install        (if node_modules missing)
#   2. neu update         (if bin/neutralino-win_x64.exe or src/neutralino.js missing).
#                          If the network is blocked (corporate proxy), falls
#                          back to a vendored copy on the
#                          claude/implement-simple-explorer-SxdNe scratch
#                          branch (see docs/roadmap.md).
#   3. build shellhelp.exe (if missing or older than tools/shellhelp.cpp)
#                          - needs MSVC `cl`. Skipped with warning if absent.
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

function Restore-VendoredRuntime {
    # Pulls bin/neutralino-win_x64.exe + src/neutralino.js out of the
    # claude/implement-simple-explorer-SxdNe scratch branch, where they
    # are intentionally vendored as a corporate-proxy workaround. The
    # files land in the worktree only - they are not staged or committed.
    $branch = 'claude/implement-simple-explorer-SxdNe'
    if (-not (Has-Cmd git)) { return $false }
    Write-Host "==> falling back to vendored runtime from origin/$branch"
    git fetch origin $branch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git fetch origin/$branch failed."
        return $false
    }
    git restore --source="origin/$branch" -- bin/neutralino-win_x64.exe src/neutralino.js
    return ((Test-Path 'bin/neutralino-win_x64.exe') -and (Test-Path 'src/neutralino.js'))
}

$needsRuntime = (-not (Test-Path 'bin/neutralino-win_x64.exe')) -or (-not (Test-Path 'src/neutralino.js'))
if ($needsRuntime) {
    Write-Host "==> Neutralino runtime missing - running 'neu update'"
    npm run setup
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "'neu update' failed (commonly: corporate proxy blocking github.com)."
        if (-not (Restore-VendoredRuntime)) {
            Write-Error "Could not obtain Neutralino runtime via 'neu update' OR vendored fallback. See docs/roadmap.md - 'Vendored Neutralino runtime'."
            exit 1
        }
    } elseif (-not (Test-Path 'src/neutralino.js')) {
        # 'neu update' completed but didn't produce src/neutralino.js - older
        # CLI versions only fetch the binary. Backfill from the scratch branch.
        if (-not (Restore-VendoredRuntime)) {
            Write-Error "'neu update' did not produce src/neutralino.js, and the vendored fallback also failed."
            exit 1
        }
    }
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
            & cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp /link shell32.lib ole32.lib user32.lib
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

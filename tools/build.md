# Building `shellhelp.exe`

Native Win32 helper used by `src/fs.js` for fast right-click actions
(Properties dialog, delete-to-Recycle-Bin, drive listing) and the
integrated terminal's PTY backend. Eliminates the ~200 ms PowerShell
cold-start tax those actions used to pay and unlocks ConPTY for the
real terminal.

## Two ways to build

### Preferred: GitHub Actions (no local toolchain)

`.github/workflows/build-shellhelp.yml` runs on every push that touches
`tools/shellhelp.cpp` (or via `workflow_dispatch`) and uploads the
compiled binary as an artifact named `shellhelp`. To pull it locally:

```
gh run download --name shellhelp --dir extras/
```

Commit `extras/shellhelp.exe` if the rebuild is intentional — the exe
is tracked in git so end users never need a compiler.

### Local fallback: MSVC

If you have MSVC available and want to iterate without waiting for CI:

**Prerequisites**

- Microsoft C++ Build Tools (free):
  https://visualstudio.microsoft.com/visual-cpp-build-tools/ — install the
  "Desktop development with C++" workload.
- A "Developer Command Prompt for VS 20xx" so `cl` is on `PATH`.

**Build**

From a Developer Command Prompt:

```
cd tools
cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp ^
   /link shell32.lib ole32.lib user32.lib gdi32.lib windowscodecs.lib
```

(`user32.lib` is needed for the menu-walking calls — `GetMenuItemCount`,
`GetMenuItemInfoW`, `CreatePopupMenu` — used by the `menu` / `invoke` verbs.
`gdi32.lib` + `windowscodecs.lib` are added in Phase 7e for the `thumb`
verb's `IShellItemImageFactory::GetImage` and WIC PNG encoder.)

The output is `tools/shellhelp.exe`. Move it next to the runtime so the app
picks it up:

```
move shellhelp.exe ..\extras\shellhelp.exe
```

`extras/shellhelp.exe` is intentionally tracked in git so end users running
`npm install` do not need a compiler. Re-run this build only when the C++
source changes.

## Bundling for release

`npm run build` bundles `src/` into the Neutralino exe. `extras/shellhelp.exe`
is **not** bundled automatically — copy it next to the produced binary:

```
copy extras\shellhelp.exe dist\simpleexplorer\extras\shellhelp.exe
```

## Why MSVC C++ instead of Rust / .NET / Go

A Rust or Go helper would also work but adds a separate toolchain just for
this 80-line binary. .NET pulls in the CLR and slows cold-start to ~300 ms,
defeating the point. Plain MSVC C++ is the smallest, fastest path; the
source is short enough to audit at a glance.

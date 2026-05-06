# Building `shellhelp.exe`

Native Win32 helper used by `src/fs.js` for fast right-click actions
(Properties dialog, delete-to-Recycle-Bin, drive listing). Eliminates the
~200 ms PowerShell cold-start tax those actions used to pay.

## Prerequisites

- Microsoft C++ Build Tools (free):
  https://visualstudio.microsoft.com/visual-cpp-build-tools/ — install the
  "Desktop development with C++" workload.
- A "Developer Command Prompt for VS 20xx" so `cl` is on `PATH`.

## Build

From a Developer Command Prompt:

```
cd tools
cl /nologo /EHsc /O2 /utf-8 shellhelp.cpp /link shell32.lib ole32.lib
```

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

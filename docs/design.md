# SimpleExplorer — Design

Single source of truth for current status, architecture, and conventions
specific to this codebase. See [`../CLAUDE.md`](../CLAUDE.md) for repository-
wide AI-assistant conventions (branch discipline, Conventional Commits, etc.).
Forward-looking work — what's painted but not wired, and what's deferred —
lives in [`./roadmap.md`](./roadmap.md).

## North star

An explorer for Windows. **Simple and fast.** Optimize every change for those
two words. If a change adds complexity without making the explorer measurably
simpler to use or faster to launch/browse, drop it.

## Status

v1 in progress. The shell is a Neutralinojs Windows desktop app; the frontend
is vanilla HTML/CSS/JS rendering three switchable design directions. Real
local FS access is wired through `Neutralino.filesystem` plus a few PowerShell
shell-outs for shell-integration features Neutralino does not cover natively.

## Stack

- **Shell:** Neutralinojs. One native Windows `.exe` (~2 MB) wrapping the OS
  WebView2 (already installed on Win11). No Rust, no MSVC, no .NET.
- **Frontend:** vanilla HTML/CSS/JS, ES modules, **no bundler**, **no React**.
- **Filesystem:** real local FS via the `Neutralino.filesystem` API plus a few
  PowerShell shell-outs for things Neutralino doesn't cover natively (recycle
  bin, drive list, Properties dialog).

## Run / build

- `npm start` — one-command path. Runs `scripts/run.ps1`, which is
  idempotent: `npm install` if needed, `neu update` if needed, build
  `extras/shellhelp.exe` if MSVC `cl` is on PATH and the binary is
  missing/stale, then `neu run`.
- Granular: `npm install` (once), `npm run setup` (one-time runtime
  download), `npm run dev` (hot-reload), `npm run build` (release exe).
- `src/index.html` opens directly in a browser too — `src/fs.js` falls
  back to mock data when `window.Neutralino` is missing.

## Layout

```
neutralino.config.json    Neutralino app + window + binary config
src/                      frontend, no build step
  ├── index.html          entry; loads neutralino.js then app.js
  ├── app.js              top-level: panes, settings, action dispatch, key bindings
  ├── pane.js             shared pane engine: row rendering, navigation, context menu
  ├── fs.js               Neutralino-FS adapter + mock fallback + path helpers
  ├── icons.js            inline SVG icons (lifted from design bundle)
  ├── sidebar-data.js     static sidebar + rail item lists
  ├── styles.css          all CSS; per-direction themed via [data-direction] / [data-theme]
  └── directions/
        ├── fluent.js     A · Fluent Refined (Win11 Mica chrome)
        └── cmd.js        B · Command-bar first (Linear/Arc inspired)
docs/
  └── design.md           this file (single source of truth per CLAUDE.md)
```

`bin/` (Neutralino runtime), `dist/` (build output), and `src/neutralino.js`
(generated client lib) are gitignored.

## Native helpers

Several right-click actions — Properties, Delete-to-Recycle-Bin, drive
list, and the full Windows shell context menu — used to either shell out
to PowerShell or be missing entirely. Each PowerShell call paid ~200 ms
of cold-start, dominating perceived latency, and the curated JS-only
menu was missing the OS shell-extension entries (Open with VS Code, Git
Bash, 7-Zip, TortoiseSVN, Send to, …) that users expect from stock
Explorer. To stay near native speed without re-introducing Rust/MSVC at
install time, we ship a small MSVC-built binary at `extras/shellhelp.exe`:

| Verb | Implementation | Replaces |
| --- | --- | --- |
| `properties <path>` | `ShellExecuteEx("properties")` | PowerShell + `Shell.Application` COM |
| `trash <path…>` | `IFileOperation::DeleteItem` (batched, recycle-bin flag) | PowerShell + `Microsoft.VisualBasic.FileIO` |
| `drives` | `GetLogicalDriveStringsW` + `GetDiskFreeSpaceExW` → JSON | PowerShell + `Get-PSDrive` |
| `menu <path…>` | `IShellFolder::GetUIObjectOf` → `IContextMenu::QueryContextMenu` → JSON tree | curated static JS list |
| `invoke <id> <path…>` | `IContextMenu::InvokeCommand` with the chosen verb id | (no equivalent before) |
| `thumb <size> <path>` | `IShellItemImageFactory::GetImage` → WIC PNG → `%TEMP%` path printed to stdout | kind icons only |
| `dragout <path…>` | `BHID_DataObject` → `DoDragDrop`; `DROPEFFECT` printed to stdout | (no equivalent before) |
| `pty <shell> [<cwd>]` | `CreatePseudoConsole` + two-thread byte pump between helper stdin/stdout and the PTY | line-oriented `spawnProcess` (Phase 7g v1) |

The curated SimpleExplorer items (Open in active pane, Copy path, Rename,
Delete, Show in Explorer, Properties) still live in `src/pane.js` and
render at the top of the menu — they're *ours*, not the OS's, and they
don't appear in `IContextMenu`. Below them, the helper's JSON tree fills
in asynchronously: typically < 300 ms, < 1 s worst case. Submenus
(`Send to`, `7-Zip`, `TortoiseSVN`) expand on hover after a 200 ms delay
and use `IContextMenu3::HandleMenuMsg2(WM_INITMENUPOPUP)` to populate
lazy entries. A 3-second TTL cache keyed by selection paths avoids
re-walking COM on repeat right-clicks.

Source: [`tools/shellhelp.cpp`](../tools/shellhelp.cpp). Build instructions:
[`tools/build.md`](../tools/build.md). The compiled exe is checked into
`extras/` so end users never need a C++ toolchain.

`src/fs.js` calls the helper when present and falls back to the original
PowerShell paths when not — this keeps the app working immediately after
`git pull` and before someone with MSVC has rebuilt the helper.

Latency budget after the change:

- Right-click → curated items visible: < 30 ms
- Right-click → shell-extension items filled: < 300 ms typical, < 1 s worst case
- Right-click → Properties dialog visible: < 100 ms (was 250–400 ms)
- Delete (single file): < 100 ms (was 250–400 ms)
- Drive list paint: < 150 ms (was 250–400 ms)

Open / Open in VS Code / Open in Terminal / Show in Explorer / Copy path /
Rename are already direct spawns or pure JS — no helper needed.

### Integrated terminal (Phase 8b)

`src/terminal.js` mounts an [xterm.js](https://xtermjs.org/) Terminal into
a bottom panel and pipes bytes to `extras/shellhelp.exe pty <shell>`,
which spawns the chosen shell under a Windows ConPTY. This replaces the
Phase 7g line-oriented `<pre>` + input stub that couldn't host vim, less,
top, ssh password prompts, or shell tab-completion.

xterm.js is vendored offline at `src/vendor/xterm/` (core 5.5.0 +
addon-fit 0.10.0 + addon-web-links 0.11.0). Bundle is loaded as plain
`<script>` tags from `src/index.html`; UMD wrappers attach `Terminal`,
`FitAddon.FitAddon`, and `WebLinksAddon.WebLinksAddon` to `globalThis`.
No bundler step.

Resize is plumbed as an out-of-band control sequence on stdin:
`ESC ] SE_CTL ; resize ; <cols> ; <rows> BEL`. The helper's stdin pump
intercepts the OSC-framed prefix and calls `ResizePseudoConsole`;
everything else passes through to the PTY input pipe untouched. The
sentinel `ESC ] SE_CTL ;` won't be produced by user keystrokes, so
collision risk is effectively zero. xterm.js triggers a resize via
`ResizeObserver` on the panel element, coalesced through `requestAnimationFrame`
so splitter drags don't flood the helper.

Helper missing? The panel renders a one-paragraph "build the helper or
download the CI artifact" message and stays out of the way. We
deliberately do *not* fall back to the v1 line-oriented stub — that was
the trap Phase 7g shipped (broken vim, broken password prompts, broken
tab completion); inheriting it as a fallback would just move the trap
behind a flag.

## Design source of truth (visual)

The visual reference originates from a Claude Design handoff bundle. Port
colors, spacing, fonts, and SVG icons exactly from the prototype JSX rather
than inventing new values:

- `explorer-shared.jsx` — colors, icon set, sample paths
- `explorer-fluent.jsx` — Direction A spec (palette near the top)
- `explorer-cmd.jsx` — Direction B spec

When tweaking visuals, port from those files.

## Conventions (project-specific)

- **No React/JSX, no UI framework.** Vanilla DOM updates are fast enough for
  a file list and keep the surface area small.
- **CSS variables for theming.** Every direction defines a palette block in
  `styles.css` keyed on `[data-direction][data-theme]`. Components reference
  `var(--bg)`, `var(--text)`, `var(--accent)`, etc. — never hard-code colors.
- **One module per direction.** Chrome differences live in
  `src/directions/<name>.js`. Shared row/pane logic lives in `src/pane.js`.
  A pane owns a list of tabs; the active tab's fields (`path`,
  `history`, `selected`, `entries`, `filter`) are mirrored on the
  pane object so existing call sites read them directly without
  threading a tab argument.
- **All FS calls go through `src/fs.js`.** Don't call `Neutralino.*` directly
  from UI code — that adapter handles the Neutralino/mock split.
- **Settings persist via `localStorage`** under the `simple-explorer.*` keys.
  No state library. Tab state (per-pane `tabs[].path` + `activeTabIdx`) lives
  under `simple-explorer.tabs`; non-active tabs lazy-list their entries on
  first switch.
- **Right-click actions** dispatch a `CustomEvent('explorer:action', { detail })`
  on `document`; `app.js` routes them through `doAction()`. Add new menu
  items to the array in `pane.js` `showContextMenu()` and a `case` in
  `doAction()`.

## Don'ts

- Don't add a bundler (Vite, webpack). The frontend is intentionally
  build-step-free. If a file gets too big, split it into more ES modules.
- Don't import a UI framework or component library.
- Don't add a state-management library — `localStorage` + plain objects is
  enough.
- Don't add features the user hasn't asked for. The v1 deliberately ships
  *less* than stock Explorer (no thumbnails, no preview pane) to keep launch
  fast and code small. Re-justify any expansion against the north star.
- Don't reach for a native extension to add a context-menu action when a
  PowerShell shell-out via `Neutralino.os.execCommand` will do — see the
  Properties / Recycle Bin / drive list paths in `src/fs.js` for the pattern.

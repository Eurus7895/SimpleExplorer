# SimpleExplorer — Design

Single source of truth for current status, architecture, and conventions
specific to this codebase. See [`../CLAUDE.md`](../CLAUDE.md) for repository-
wide AI-assistant conventions (branch discipline, Conventional Commits, etc.).

## North star

An explorer for Windows. **Simple and fast.** Optimize every change for those
two words. If a change adds complexity without making the explorer measurably
simpler to use or faster to launch/browse, drop it.

## Status

v1 in progress. The shell is a Neutralinojs Windows desktop app; the frontend
is vanilla HTML/CSS/JS rendering three switchable design directions. Real
local FS access is wired through `Neutralino.filesystem` plus a few PowerShell
shell-outs for shell-integration features Neutralino does not cover natively.

> **Note:** `CLAUDE.md` describes the project as Python and prescribes
> Python-idiom checks (`ruff`, `mypy`, `pytest`). That framing pre-dates this
> implementation and is treated here as repository-wide conventions; the
> per-language commands listed there are not currently wired up. The actual
> stack is JavaScript (no Python). Reconcile this either by adding JS
> equivalents to `CLAUDE.md` or by accepting that the conventions are
> language-agnostic.

## Stack

- **Shell:** Neutralinojs. One native Windows `.exe` (~2 MB) wrapping the OS
  WebView2 (already installed on Win11). No Rust, no MSVC, no .NET.
- **Frontend:** vanilla HTML/CSS/JS, ES modules, **no bundler**, **no React**.
- **Filesystem:** real local FS via the `Neutralino.filesystem` API plus a few
  PowerShell shell-outs for things Neutralino doesn't cover natively (recycle
  bin, drive list, Properties dialog).

## Run / build

- `npm install` (once) — only dev dep is `@neutralinojs/neu`.
- `npm run setup` — one-time: downloads Neutralino runtime binaries to `bin/`.
- `npm run dev` — opens the app with hot reload of `src/`.
- `npm run build` — produces `dist/simpleexplorer/simpleexplorer-win_x64.exe`.
- `src/index.html` opens directly in a browser too — `src/fs.js` falls back
  to mock data when `window.Neutralino` is missing.

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
        ├── cmd.js        B · Command-bar first (Linear/Arc inspired)
        └── workspace.js  C · Workspaces (saved pane sets, tinted accents)
docs/
  └── design.md           this file (single source of truth per CLAUDE.md)
```

`bin/` (Neutralino runtime), `dist/` (build output), and `src/neutralino.js`
(generated client lib) are gitignored.

## Design source of truth (visual)

The visual reference originates from a Claude Design handoff bundle. Port
colors, spacing, fonts, and SVG icons exactly from the prototype JSX rather
than inventing new values:

- `explorer-shared.jsx` — colors, icon set, sample paths
- `explorer-fluent.jsx` — Direction A spec (palette near the top)
- `explorer-cmd.jsx` — Direction B spec
- `explorer-workspace.jsx` — Direction C spec

When tweaking visuals, port from those files.

## Conventions (project-specific)

- **No React/JSX, no UI framework.** Vanilla DOM updates are fast enough for
  a file list and keep the surface area small.
- **CSS variables for theming.** Every direction defines a palette block in
  `styles.css` keyed on `[data-direction][data-theme]`. Components reference
  `var(--bg)`, `var(--text)`, `var(--accent)`, etc. — never hard-code colors.
- **One module per direction.** Chrome differences live in
  `src/directions/<name>.js`. Shared row/pane logic lives in `src/pane.js`.
- **All FS calls go through `src/fs.js`.** Don't call `Neutralino.*` directly
  from UI code — that adapter handles the Neutralino/mock split.
- **Settings persist via `localStorage`** under the `simple-explorer.*` keys.
  No state library.
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

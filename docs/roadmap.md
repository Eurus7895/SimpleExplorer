# SimpleExplorer — Roadmap

Forward-looking backlog and honest MVP audit. Architecture / current
state lives in [`design.md`](./design.md); repository conventions live
in [`../CLAUDE.md`](../CLAUDE.md). This file is the source of truth for
**what's painted but not wired**, and **what hasn't been started**.

Status as of the last commit on `claude/implement-simple-explorer-SxdNe`:
**MVP**, not v1. The three direction skins render and the core file
operations (list, copy, move, rename, delete, open) work, but several
buttons in the chrome are decorative.

## Known bugs

- **Cross-pane row double-click swallowed** *(workaround documented below)*.
  Clicking a row in a non-active pane currently only selects, it no longer
  activates that pane (we had to stop the click from bubbling to the pane
  card or same-pane double-click was broken too). To enter a folder in a
  pane that isn't active, click the pane's chrome (header / breadcrumb /
  empty area) once to activate it, then double-click the folder. Fix:
  refactor pane activation to toggle a CSS class directly instead of
  triggering a full re-render. Tracked under Phase 6.
- **`extras/shellhelp.exe` not yet compiled.** Right-click → Properties /
  Delete-to-trash / drive list fall back to PowerShell (~250–400 ms vs
  ~50 ms native). Build once with MSVC; `scripts/run.ps1` automates from
  there.

## MVP audit

### Wired (works)

- Direction switcher (A · Fluent / B · Cmd / C · Workspaces)
- Theme toggle (light ↔ dark, per direction)
- Layout picker (1, 2v, 2h, 3, 4 panes)
- Back / Forward / Up navigation per pane
- Search input (filters visible rows in the active pane)
- Row click (select), double-click (open), right-click (custom menu)
- Pane click sets active pane
- Right-click actions: Open, Open in VS Code, Open in Terminal,
  Copy path, Rename, Delete, Show in Explorer, Properties
- Fluent command bar buttons: New folder · Copy · Rename · Delete · Compare
- Workspace bottom dock: same set + "Copy → other pane" / "Compare panes"
  shown when ≥ 2 panes
- Fluent sidebar full quick-access list — click navigates active pane
- Recent items in Fluent + Workspace sidebars — click navigates
- Real Windows Properties dialog (via `extras/shellhelp.exe` when built;
  PowerShell fallback otherwise)
- Recycle Bin via `IFileOperation` (helper) or
  `Microsoft.VisualBasic.FileIO` (fallback)

### Painted but not wired (the gap)

These render and look right, but clicking them does nothing today:

| Where | Element | Should do |
| --- | --- | --- |
| All directions | Window controls `─ ☐ ✕` | minimize / maximize / exit via `Neutralino.window.*` |
| All directions | Breadcrumb segments | click → navigate to that segment |
| Fluent pane chrome | Tab `×` close, tab `+` add | implement multi-tabs per pane |
| Direction B | Rail icons (Home / Pinned / Recent / Downloads / Docs / Drives) | click → navigate / open panel |
| Direction B | Pane header View / Sort / More | sort dropdown, view-mode menu |
| Direction B | Ctrl+K command palette | open palette overlay, route input to commands / path nav / fuzzy file search |
| Direction C | Workspace tabs (Qt project / Triage / Compare runs / Research) | click → switch to that workspace's pane set |
| Direction C | Workspace `+` button | "save current panes as workspace" |
| Direction C | Sidebar Pinned items | click → navigate |
| Direction C | Sidebar Drives (hardcoded "146 GB" / "892 GB") | populate from `fs.listDrives()` |
| Direction C | Pane head "more" button, search icon | menu / search-in-pane |

### Not started — explicitly out of MVP scope

- Tree view (left of the row list, expandable folders)
- Column view (Finder-style cascading panes)
- Recursive search (only filter visible rows in MVP)
- Drag-and-drop between panes
- Drag-and-drop from / to stock Windows Explorer
- Custom Win11 Mica title bar chrome (frameless window + own controls)
- Full Windows shell context menu via `IContextMenu`
  (every installed shell extension — Git Bash, 7-Zip, etc.)
- Thumbnails for images / videos
- File preview pane
- Zip-as-folder browsing
- JS lint / test tooling (`eslint` or `biome`, `vitest` or `node:test`)
- Build-step that auto-copies `extras/shellhelp.exe` into `dist/`
- Compiled `extras/shellhelp.exe` itself
  (source ready; needs a one-time MSVC compile)

## Roadmap, sized and prioritized

### Phase 1.5 — Full Windows shell context menu (~3 days)

> **Promoted from Phase 7.** The user explicitly wants the right-click
> menu to match stock Explorer (Bosch File Services, FastSearch,
> SWB-Shell, Open with Code, Open Git Bash, 7-Zip, TortoiseSVN, Send to,
> Properties, …) — i.e. every installed shell extension, not the
> curated short list we ship today.

Implementation:

1. Extend `tools/shellhelp.cpp` with two verbs:
   - `menu <path>` — walk the shell namespace from the given path,
     `IShellFolder::GetUIObjectOf` → `IContextMenu::QueryContextMenu`,
     iterate command IDs via `GetCommandString` for verb names + display
     strings, build a JSON tree (entries can be separators, submenus,
     or leaf items). Print to stdout.
   - `invoke <path> <commandId>` — same setup, then
     `IContextMenu::InvokeCommand` with the chosen verb. Returns 0 on
     success.
2. JS side: replace the static `items` array in `pane.js`
   `showContextMenu()` with an async fetch — call `helper('menu', path)`,
   parse JSON, render the menu including submenus on hover. Add the
   curated SimpleExplorer items (Open in pane, Compare panes) at the
   top so they're always available even on shell-extension-poor systems.
3. Click handler routes to either:
   - The local `doAction()` for SimpleExplorer-only verbs.
   - `helper('invoke', path, commandId)` for shell-extension verbs.
4. Cache the menu JSON per file path for a few seconds to avoid
   re-walking COM on rapid right-clicks of the same file.
5. Multi-file selection: `IContextMenu` accepts an array of PIDLs.
   Extend the helper to take multiple paths and emit the union menu.

Risks / gotchas:

- Some shell extensions do extra work (icon loading, dynamic labels)
  that can stall the menu walk. Render the curated items immediately
  and append shell entries as they arrive; don't block on them.
- Some extensions only register for specific file types — the helper
  must inspect file extension / folder vs file before invoking
  `IShellFolder` properly.
- Icons (the colored leading icons in the screenshot) come from
  `IContextMenu::GetCommandString` + `IExtractIcon`. Optional v1; ship
  text-only first, icons in a follow-up.

Once shipped, the curated right-click in `pane.js` shrinks to a few
SimpleExplorer-specific actions; everything else (Properties, Open with
Code, Cut, Copy, Send to, Delete, Rename, third-party shell extensions)
flows through the helper.

### Phase 1 — Stop the "buttons don't work" feel (1–2 hours, one commit)

Hits the most visible MVP gaps. No new architecture; just wire what's
already painted.

- Clickable breadcrumb segments in all three directions.
- Direction B rail items navigate.
- Direction C sidebar Pinned items navigate.
- Direction C drives populated from `fs.listDrives()` instead of hardcoded.
- Window controls (─ ☐ ✕) call `Neutralino.window.minimize() / maximize() /
  unmaximize() / app.exit()`.
- Compile `extras/shellhelp.exe` (you do this on a Windows box with MSVC
  once; `scripts/run.ps1` already auto-builds when `cl` is on PATH).

### Phase 2 — Real multi-tabs per pane (~half day)

Tabs in Fluent's pane chrome currently render a single static label. Make
them real: state per tab (path, history, selection), `+` opens a new tab
in the pane, `×` closes the tab (close last → close pane). Persist tabs
in `localStorage` alongside existing pane state.

Touches: `pane.js` (state shape), `app.js` (new actions: `tabNew`,
`tabClose`, `tabSwitch`), `directions/fluent.js` (real tab bar).

### Phase 3 — Workspace switching for Direction C (~half day)

Workspaces today are decorative tabs. Make them real saved pane sets:

- "Save current pane layout as workspace …" via the `+` button.
- Click a workspace tab → swap the entire pane grid.
- Persist via `localStorage` under `simple-explorer.workspaces`.
- Default seeded set on first run matches the current decorative tabs.

### Phase 4 — Direction B command palette (~half day)

Currently the top input filters rows like the Fluent search. Make it the
designed Ctrl+K palette:

- Ctrl+K opens an overlay anchored under the input.
- Three modes: path (typing `/` or a drive letter → directory autocomplete);
  search (default; filters across known recents + current pane);
  command (`>` prefix → run a `doAction()` verb).
- ESC closes; Enter runs.

### Phase 5 — Sort + view modes (~1–2 hours)

The "Sort" / "View" buttons on Direction B's pane header (and the column
header chevron in Fluent) need menus:

- Sort: Name / Size / Modified / Type, asc / desc, sticks per pane.
- View: Details (current), Tiles, Compact (denser rows). Tree and Column
  view stay deferred.

### Phase 6 — Quality of life, smaller items (one-off, mix and match)

- **Pane-activation refactor** so cross-pane row clicks work without
  re-rendering. Today, `setActivePane()` triggers a full `render()` which
  rebuilds the row DOM and breaks any in-flight double-click. Fix: toggle
  the active CSS class directly on pane cards instead of re-rendering;
  re-render only when something else (layout / direction / theme)
  actually changed. Will let row click in a non-active pane both select
  and activate cleanly. Tracked here because it's deferred from the
  initial bug fix (which only handles the same-pane case).
- `npm run build` post-step: auto-copy `extras/shellhelp.exe` into the
  produced `dist/simpleexplorer/extras/`. Currently manual.
- Drag-and-drop between panes (move within drive, copy across drives —
  same rule stock Explorer uses).
- Status-bar selection size sum (sum of bytes when ≥ 1 file selected).
- Ctrl+L focus address bar (currently no address-bar focus mode).
- F2 inline rename instead of `prompt()` modal.
- Esc clears selection.

### Phase 7 — Larger features (deferred, design needed)

These need their own short plan before starting; rough cost in days.

- **Tree view** in the sidebar (~2 days) — virtualized tree over real FS,
  expand/collapse, persist expansion state.
- **Recursive search** (~2 days) — background walk, cancellation, results
  pane, hit highlighting.
- **Native Windows shell context menu** — *promoted to Phase 1.5*.
- **Mica + frameless chrome** (~1 day) — `borderless: true` in
  `neutralino.config.json`, custom title-bar component, hit-testing for
  drag region; matches Direction A's design intent.
- **Thumbnails** (~3 days) — async generation via Shell COM
  (`IShellItemImageFactory::GetImage`), in-memory LRU cache, fallback
  to kind icons. Requires the helper exe.
- **File preview pane** (~2 days) — text / image / PDF / md preview;
  separate column, toggleable.
- **Drag-and-drop with the OS** (~2 days) — accept drops from stock
  Explorer (HTML5 dataTransfer to FS path resolution), drag from our
  panes back out (Neutralino currently can't initiate OS drags — needs
  a native helper).

## Open questions / debt

- **`extras/shellhelp.exe`** isn't compiled yet. Until you have MSVC
  installed and run `scripts/run.ps1` once, Properties / Delete /
  drives stay on the slow PowerShell path.
- **Vendored Neutralino runtime** in `bin/neutralino-win_x64.exe` is a
  scratch-branch workaround for the corporate-proxy block on
  `github.com`. If this branch ever gets cleaned up for `main`, the
  binary must come out and the proxy issue must be solved upstream.
- **No tests at all.** CLAUDE.md prescribes `tests/` but JS test
  tooling isn't wired. First test target probably should be `fs.js`'s
  pure helpers (`joinPath`, `parentPath`, `pathSegments`,
  `formatSize`, `formatModified`).
- **CSS lives in one 19 KB `styles.css`.** As directions grow this will
  fight us; consider splitting per-direction once Phase 2 lands.

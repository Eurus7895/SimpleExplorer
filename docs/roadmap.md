# SimpleExplorer — Roadmap

Forward-looking backlog and honest MVP audit. Architecture / current
state lives in [`design.md`](./design.md); repository conventions live
in [`../CLAUDE.md`](../CLAUDE.md). This file is the source of truth for
**what's painted but not wired**, and **what hasn't been started**.

Status as of the last commit on `claude/review-roadmap-MKEpx`:
post-MVP, pre-v1. Phase 1 (chrome wiring) and Phase 1.5 (full Windows
shell context menu) have shipped; the remaining gap is multi-tabs,
workspace switching, the Ctrl+K palette, and sort/view menus.

## Shipped

- **Phase 1 — chrome wiring** (commit `0b7242e`). Fluent window
  controls, clickable breadcrumbs in all three directions, Direction B
  rail navigation, Direction C Pinned, dynamic drives section in both
  Fluent and Workspace sidebars (real free-space numbers from
  `fs.listDrives()`).
- **Phase 1.5 — full Windows shell context menu**. Two new helper
  verbs in `tools/shellhelp.cpp` (`menu` walks `IContextMenu` →
  emits a JSON tree; `invoke` calls `InvokeCommand` for the chosen
  verb id). `src/pane.js` now renders the curated SimpleExplorer
  items at the top, then asynchronously fills shell-extension entries
  underneath, with hover-spawn submenus, a 3-second TTL cache, and
  graceful fallback to the legacy curated-only list when the helper
  isn't compiled. Helper still needs an MSVC build pass on a Windows
  box (`tools/build.md`) to ship the binary.

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

### ~~Phase 1.5 — Full Windows shell context menu~~ (shipped)

> **Promoted from Phase 7.** The user explicitly wants the right-click
> menu to match stock Explorer (Bosch File Services, FastSearch,
> SWB-Shell, Open with Code, Open Git Bash, 7-Zip, TortoiseSVN, Send to,
> Properties, …) — i.e. every installed shell extension, not the
> curated short list we ship today.

Implementation lives in `tools/shellhelp.cpp` (verbs `menu` + `invoke`)
and `src/pane.js` (curated section + async shell fill + submenus +
cache). Notes preserved below for context; further follow-ups (icons,
keyboard navigation, watchdog timeout for hangy extensions) are tracked
in [Open questions / debt](#open-questions--debt).

#### Approach

Extend the existing native helper (`tools/shellhelp.cpp` →
`extras/shellhelp.exe`) with two new verbs that wrap COM
`IContextMenu`, and replace the static JS menu with an async fetch of
the helper's JSON.

```
shellhelp menu <path> [<path> …]      → JSON tree of menu entries to stdout
shellhelp invoke <id> <path> [<path>…] → invoke command id on path(s)
```

`menu` walks `IShellFolder` from the parent dir, calls `GetUIObjectOf`
to obtain `IContextMenu`, then `QueryContextMenu` into an `HMENU` and
introspects each entry. For submenus (`MFT_SUBMENU`), recursively
expand. Output is JSON for tractable parsing.

`invoke` rebuilds the same `IContextMenu` and calls `InvokeCommand`
with the chosen verb id. Path is required so the helper can rebuild
the COM object (no shared state between calls).

#### Files affected

**Modified**

- **`tools/shellhelp.cpp`** — add ~150 lines for `menu` + `invoke`.
  Skeleton:

  ```cpp
  static HRESULT build_context_menu(int n, wchar_t** paths,
                                    IContextMenu** out_cm,
                                    HMENU* out_hm);
  static int verb_menu(int argc, wchar_t** argv);
  static int verb_invoke(int argc, wchar_t** argv);
  ```

  - `build_context_menu` resolves each path to an `IShellItem`, gets
    the parent `IShellFolder`, and aggregates child PIDLs into one
    `GetUIObjectOf` call so multi-select acts on the union (matches
    Explorer behavior).
  - `verb_menu` calls `QueryContextMenu(hm, 0, MIN_ID, MAX_ID,
    CMF_NORMAL | CMF_EXTENDEDVERBS)` and walks the `HMENU`. For each
    item: read text via `GetMenuStringW`, the verb id via
    `GetMenuItemID`, the canonical verb via
    `IContextMenu::GetCommandString(id, GCS_VERBW, …)`, recurse into
    submenus via `GetSubMenu`. Emit JSON like:

    ```json
    [
      { "id": 1,    "label": "Open",            "verb": "open" },
      { "id": 0,    "label": "",                "separator": true },
      { "id": null, "label": "7-Zip",
        "submenu": [{"id": 102, "label": "Add to archive…", "verb": "..."}] }
    ]
    ```

  - `verb_invoke` rebuilds the menu (cheap on a warm process,
    necessary because the HMENU is stateful) and calls
    `InvokeCommand` with `CMINVOKECOMMANDINFOEX` — pass the parent
    HWND, verb id, and `nShow = SW_SHOWNORMAL`.

- **`src/fs.js`** — add `helperMenu(paths)` and `helperInvoke(id,
  paths)` thin wrappers over `helperAvailable()` + `runHelper()`.
  Mock fallback returns the static curated list so the in-browser
  preview still works.

- **`src/pane.js`** — rewrite `showContextMenu(x, y, entry)`:
  1. Always render the curated SimpleExplorer items (Open in pane,
     Compare panes, Copy path) at the top — these are *ours*, not
     the OS's, and they don't show up in `IContextMenu`.
  2. After the curated items, render a `Loading…` placeholder.
  3. `await helperMenu([paths])`. On success, replace placeholder
     with the parsed JSON. On failure (or when the helper isn't
     compiled), fall back to today's static list.
  4. Submenus open on hover after a 200 ms delay (standard Windows
     menu behavior). Render position auto-flips to the left when a
     submenu would overflow the viewport.
  5. Click handler: SimpleExplorer items route to `doAction()`;
     shell-extension items call `helperInvoke(id, paths)` and
     dismiss the menu.

  Add a small in-memory cache keyed by `paths.join('\0')` with a
  3-second TTL so repeated right-clicks of the same item don't
  re-walk COM.

- **`docs/design.md`** — extend the "Native helpers" table to list
  the two new verbs alongside `properties`, `trash`, `drives`. Note
  that the curated items still live in the JS menu and explain why.

- **`docs/roadmap.md`** — once landed, move this Phase 1.5 entry to
  a "shipped" section.

**Untouched**

- `src/app.js` — the right-click → `doAction()` plumbing is already
  generic (`document.dispatchEvent('explorer:action', { detail })`);
  shell-extension invocations bypass it and call `helperInvoke`
  directly from inside the menu's click handler.

#### Verification

1. Helper rebuild: `cd tools && cl /nologo /EHsc /O2 /utf-8
   shellhelp.cpp /link shell32.lib ole32.lib`. Confirm exe < 100 KB.
2. `shellhelp menu "C:\Workspace\11_AI\SimpleExplorer\README.md"` →
   JSON includes Open, Cut, Copy, Send to, Properties, plus locally
   installed extensions (Open with Code, Git Bash, 7-Zip, TortoiseSVN).
3. `shellhelp invoke <id> "<path>"` invokes the chosen verb.
4. End-to-end in app: right-click a file. Curated items render in
   < 50 ms; shell extensions fill in < 300 ms typical.
5. Multi-select: 3 files → menu matches stock Explorer's 3-file
   menu (subset; multi-incompatible entries hidden). `Send to →
   Compressed folder` produces a single zip.
6. Submenus: hover `Send to` / `7-Zip`, expand after ~200 ms.
7. Perf budget: first paint < 50 ms; shell fill < 300 ms typical,
   < 1 s worst case.
8. Fresh Windows box without 3rd-party extensions: still has OS
   defaults plus curated items.
9. Mock mode (`src/index.html` opened in a browser): curated list
   still renders, no helper required.

#### Risks / gotchas

- **Hangy shell extensions.** Some 3rd-party extensions do I/O or
  RPC during `QueryContextMenu` and can stall multi-second. The
  helper must run with a watchdog (timeout → return partial results
  after 1 s). If a single extension consistently blocks, expose a
  per-CLSID skip-list in `neutralino.config.json`.
- **Icons.** The user's screenshot shows colored icons next to each
  entry. These come from `IExtractIconW` keyed off the registered
  CLSID. Optional v1 — ship text-only first. Followup: helper emits
  base64-encoded 16×16 PNG per item, JS renders inline.
- **Per-file-type menus.** `IContextMenu` returns different items
  for files vs folders vs drives. The helper must always go through
  `IShellFolder` from the *parent* (folder containing the item)
  rather than parsing the item directly, or many extensions don't
  appear.
- **Elevation.** Some verbs (e.g. "Run as administrator") trigger
  UAC. `InvokeCommand` handles this transparently — Windows shows
  the consent prompt — but the helper must use
  `CMIC_MASK_FLAG_NO_UI = 0` (allow UI) for those to surface.
- **Custom verbs without ASCII names.** Use `GetCommandString` with
  `GCS_VERBW` (wide variant). Some shell extensions return
  `E_NOTIMPL` for `GetCommandString` — fall back to invoking by
  numeric id.
- **Menu walk vs invoke pairing.** The HMENU + IContextMenu pair is
  stateful per `QueryContextMenu` call. After enumerating, free
  with `DestroyMenu`. For invoke, rebuild fresh — don't try to
  share state between the two helper invocations.

#### Order of work when implementation resumes

1. Add `verb_menu` to `shellhelp.cpp`, no submenu support yet.
   Smoke test against a few file types.
2. Add submenu recursion + the JSON tree shape.
3. Wire `helperMenu` in `fs.js` + the loading-then-fill flow in
   `pane.js`. Test live.
4. Add `verb_invoke`. Wire click handler in `pane.js`.
5. Add multi-select union.
6. Add the 3-second TTL cache.
7. Add the watchdog timeout for hangy extensions.
8. Update `docs/design.md` and move this entry to "shipped".
9. (Optional) icons — only if time permits.

#### Out of scope (this phase)

- Drag-and-drop into / from stock Explorer.
- Persistent context-menu state (remembering expanded submenus).
- Keyboard navigation (arrow keys / Enter). Add later.
- Custom theming of shell-extension icons / labels — ship them as
  the OS provides.
- Full `IContextMenu3` features (themed background, owner-draw).
  Use `IContextMenu` (universally supported); upgrade only if
  specific extensions misbehave.

### ~~Phase 1 — Stop the "buttons don't work" feel~~ (shipped)

Shipped as commit `0b7242e`. Items wired:

- Clickable breadcrumb segments in all three directions.
- Direction B rail items navigate (Home / Downloads / Docs).
- Direction C sidebar Pinned items navigate.
- Direction C drives populated from `fs.listDrives()`.
- Direction A drives section (new) also driven by `fs.listDrives()`.
- Fluent window controls (─ ☐ ✕) call
  `Neutralino.window.minimize() / maximize() / unmaximize() / app.exit()`.

Still pending: compile `extras/shellhelp.exe` on a Windows box with
MSVC. Until then, drive list / properties / delete fall back to
PowerShell (~250–400 ms) and the new shell context menu silently
degrades to the curated-only list.

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

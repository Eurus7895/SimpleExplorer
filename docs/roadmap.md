# SimpleExplorer — Roadmap

Forward-looking backlog and honest MVP audit. Architecture / current
state lives in [`design.md`](./design.md); repository conventions live
in [`../CLAUDE.md`](../CLAUDE.md). This file is the source of truth for
**what's painted but not wired**, and **what hasn't been started**.

Status as of the last commit on `claude/review-roadmap-MKEpx`:
post-MVP, pre-v1. Phases 1, 1.5, 2, 3, 4, 5, and 6a (Quick UX
wins + Cmd rail redesign) have shipped. The Workspace direction
has been removed; the remaining directions are Fluent (A) and
Cmd (B). Remaining work: pane-activation refactor + drag-and-drop
in Phase 6, and the Phase 7 deferred features (tree view,
recursive search, integrated terminal, …).

## Shipped

- **Phase 6a — Quick UX wins + Cmd rail redesign.** Esc clears the
  active pane selection; status bars show a byte-sum of selected
  files; F2 triggers an inline rename input on the row instead of
  a `prompt()` modal; Ctrl+L opens the palette pre-filled with the
  active pane's path; `npm run build` auto-copies
  `extras/shellhelp.exe` into `dist/`. Direction B's rail follows
  the Claude Design redesign — vertical icon + label, Pinned dropped,
  click-to-explain detail panel showing recents / drives / docs /
  downloads.
- **Phase 5 — sort + view modes.** Each tab carries `sort: { key, dir }`
  and `view` (`details` / `compact` / `tiles`). Folders cluster
  first; the comparator handles `name` (locale-aware,
  case-insensitive) / `size` / `modified` / `type`. Fluent's
  column-header cells (`cols__seg`) are clickable — same-key click
  toggles asc/desc; Fluent's command bar gained an `a-view`
  segmented chooser before the layout picker. Cmd's pane-header
  Sort and View buttons open generic `.popover` overlays.
  Compact = denser padding on the same grid; Tiles = wrapping
  flex grid of 92 × 88 px cells with the column header hidden.
  Persistence: `tabSnapshot` now serializes `{ path, sort, view }`,
  and `createPaneState` accepts both legacy string seeds and the
  new shape.
- **Phase 1 — chrome wiring** (commit `0b7242e`). Fluent window
  controls, clickable breadcrumbs, Direction B rail navigation, dynamic
  drives section in the Fluent sidebar (real free-space numbers from
  `fs.listDrives()`).
- **Phase 4 — Cmd palette + tab affordances + resize smoothness.**
  Direction B's static input is now a real Ctrl+K palette
  (`src/palette.js`) with three modes inferred from the query:
  `> …` runs a `doAction` verb; `/`, `\`, or a `<X>:` drive prefix
  triggers debounced directory autocomplete via `fs.listDir`;
  anything else searches current-pane entries and recents.
  `↑ / ↓` move highlight, Enter executes, Esc / outside-click
  dismisses. Global Ctrl+K focuses the palette only when Cmd is
  active. `doAction` gained `tabNew` / `tabClose` shims so the
  palette can dispatch them via the existing `explorer:action`
  channel. Middle-click on a Fluent tab now closes it
  (Chrome / VS Code convention); the close × stays the visible
  affordance. Pane resize now coalesces mousemove updates to one
  per animation frame and suppresses `.row` pointer events during
  the drag, eliminating the choppiness that shipped with Phase 3
  on long file lists.
- **Phase 3 — folder-background right-click + resizable panes**.
  Right-clicking the empty area of a pane opens a folder-scope menu
  (Open in VS Code · Open in Terminal · New folder · Refresh · Show
  in Explorer · Properties), with the OS shell extensions filling
  in below for the folder itself via `helperMenu([pane.path])`.
  `app.js` gained a `refresh` action; `reveal` now falls back to
  `openInOS(pane.path)` when nothing is selected. A new
  `src/layout.js` module owns `LAYOUT_DEFS` + `applyLayout()`,
  which sets the grid template with a 6 px gutter track between
  panes and inserts splitter divs there; drag updates a CSS-var
  ratio (clamped 0.1 – 0.9), commits to `settings.splits[layoutId]`
  on mouseup, persists under `simple-explorer.state.splits`. Both
  directions now route through `applyLayout` instead of setting
  `gridTemplateColumns/Rows` themselves. Live-resize smoothness
  was tightened up post-merge in Phase 4.
- **Phase 2 — real multi-tabs per pane**. Each Fluent pane now owns a
  tab list (`pane.tabs`); each tab has its own path, history,
  selection, entries, and filter. `+` opens a new tab at the active
  tab's path; `×` closes a tab (hidden when only one tab remains —
  closing the last tab is a no-op, layout-driven pane removal stays
  in Phase 6). State persists under `simple-explorer.tabs` and is
  rehydrated on launch; non-active tabs lazy-list their entries on
  first switch.
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

- **`extras/shellhelp.exe` not yet compiled.** Right-click → Properties /
  Delete-to-trash / drive list fall back to PowerShell (~250–400 ms vs
  ~50 ms native). Build once with MSVC; `scripts/run.ps1` automates from
  there.

## MVP audit

### Wired (works)

- Direction switcher (A · Fluent / B · Cmd)
- Theme toggle (light ↔ dark, per direction)
- Layout picker (1, 2v, 2h, 3, 4 panes)
- Back / Forward / Up navigation per pane
- Search input (filters visible rows in the active pane)
- Type-to-jump in the active pane (Windows Explorer style)
- Row click (select), double-click (open), right-click (custom menu)
- Pane click sets active pane
- Clickable breadcrumb segments
- Fluent window controls: minimize and close (maximize uses the OS title bar)
- Right-click actions: Open, Open in VS Code, Open in Terminal,
  Copy path, Rename, Delete, Show in Explorer, Properties
- Fluent command bar buttons: New folder · Copy · Rename · Delete · Compare
- Fluent sidebar quick-access + dynamic drives — click navigates active pane
- Recent items in Fluent sidebar — click navigates
- Direction B rail navigation (Home / Downloads / Docs)
- Real Windows Properties dialog (via `extras/shellhelp.exe` when built;
  PowerShell fallback otherwise)
- Recycle Bin via `IFileOperation` (helper) or
  `Microsoft.VisualBasic.FileIO` (fallback)

### Painted but not wired (the gap)

These render and look right, but clicking them does nothing today:

| Where | Element | Should do |
| --- | --- | --- |
| Direction B | Rail icons (Pinned / Recent / Drives) | open popover panels |
| Direction B | Pane header More button | placeholder; no menu yet |

### Not started — explicitly out of MVP scope

- Tree view (left of the row list, expandable folders)
- Column view (Finder-style cascading panes)
- Recursive search (only filter visible rows in MVP)
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

### ~~Phase 3 — Folder background right-click + resizable panes~~ (shipped)

**3a · Empty-space context menu.** `pane.js`'s `renderRows` now
listens for `contextmenu` on the `.rows` container itself (and
`.rows__empty`); the new `showFolderContextMenu(x, y, pane)` opens
a folder-scope menu (Open in VS Code · Open in Terminal · New folder ·
Refresh · Show in Explorer · Properties) and async-fills shell
extensions via `helperMenu([pane.path])`. `app.js` added a
`refresh` action and `reveal` falls back to `openInOS(pane.path)`
when nothing is selected. A new `onPaneActivate` opt on
`renderRows` activates the right pane before opening the menu so
dispatched actions don't target the wrong pane.

**3b · Resizable panes.** New `src/layout.js` owns `LAYOUT_DEFS` +
`DEFAULT_SPLITS` + `applyLayout(grid, layoutId, splits, paneCards, onChange)`,
which sets the grid template with a 6 px gutter track, places each
card by explicit `grid-column / grid-row`, and inserts splitter divs
in the gutter tracks. Drag mutates the grid template directly each
frame (clamped 0.1 – 0.9) and commits the ratio on mouseup;
`onChange` persists `settings.splits[layoutId]` and re-renders. Both
directions now go through `applyLayout`; `pane3rdAware` folded in.

### ~~Phase 2 — Real multi-tabs per pane~~ (shipped)

Each Fluent pane carries a `tabs` array (path / history / selection /
entries / filter per tab); active-tab fields are mirrored on the pane
object so existing nav/render code is unchanged. `pane.js` exports
`tabNew` / `tabClose` / `tabSwitch` / `tabSnapshot`; `app.js`
persists `panes[].tabs[].path` + `activeTabIdx` under
`simple-explorer.tabs`; `directions/fluent.js` renders the real tab
bar. Closing the last tab is a no-op (the × is hidden) — coupling
tab close to layout shrink stays in Phase 6.

### ~~Phase 4 — Cmd palette + tab affordances + resize smoothness~~ (shipped)

Cmd Ctrl+K palette lives in `src/palette.js`; modes (`command`,
`path`, `search`) are inferred from the query prefix. `app.js`
gained `tabNew` / `tabClose` `doAction` shims so the palette can
dispatch tab operations via the existing `explorer:action` channel,
and a global Ctrl+K binding focuses the palette input when Cmd is
active. Fluent tabs now close on middle-click. Pane resize
mousemove updates coalesce to one per animation frame and suppress
`.row` pointer events during the drag.

### ~~Phase 5 — Sort + view modes~~ (shipped)

Each tab now carries its own `sort: { key, dir }` and `view`
(`details` / `compact` / `tiles`). `pane.js` exports
`sortedEntries(state)` (folders cluster first, then comparator by
key); `filtered()` now sorts before filtering. Persistence:
`tabSnapshot` now returns `[{ path, sort, view }]` and
`createPaneState` accepts both legacy string seeds and the new
object shape. Fluent: column-header cells (`cols__seg`) are
clickable — same-key click toggles asc/desc, different key
switches and resets to asc. Fluent command bar gained an `a-view`
segmented chooser before the layout picker. Cmd: pane-header
Sort and View buttons open generic `.popover` overlays anchored
under the button. Compact = same grid as details with denser
padding; Tiles = wrapping flex grid of 92×88 px cells (column
header hidden in Tiles). Tree and Column view stay deferred to
Phase 7.

### ~~Phase 6a — Quick UX wins~~ (shipped)

- **Esc clears selection** in the active pane (`bindGlobalKeys`
  augmentation; existing type-jump-buffer clear stays).
- **Status-bar selection size sum.** New `selectionSizeLabel(pane)`
  in `pane.js` totals bytes of selected files; both `a-statusbar`
  and `b-pane__foot` show the result. Folder-only selections show
  nothing; mixed (file + folder) selections suffix `(files only)`
  to flag that folder size needs a recursive walk we don't do.
- **F2 inline rename.** New `pane.renaming` field; when set,
  `renderRows` substitutes the row's `<span class="row__label">`
  with an autoFocused `<input class="row__rename">` (basename
  pre-selected, extension preserved). Enter commits via
  `fs.rename`; Esc / blur cancels. Replaces the previous
  `prompt()` modal.
- **Ctrl+L → palette in path mode.** `openPalette` accepts an
  optional `initialQuery`; the global keydown handler maps Ctrl+L
  to opening / focusing the palette with the active pane's path
  pre-filled (cursor at end). Cmd dispatches an `input` event so
  the palette's path-completion mode kicks in.
- **`npm run build` post-step** — `scripts/copy-helper.mjs` copies
  `extras/shellhelp.exe` into `dist/simpleexplorer/extras/` after
  `neu build`. Idempotent; silently skips when the helper isn't
  built yet.
- **Cmd rail redesign** (from Claude Design handoff). Drop the
  Pinned section; five vertical icon + label items (Home, Recent,
  Downloads, Docs, Drives) on a 64 px rail. Click any non-Home
  item opens a 200 px detail panel listing entries inside that
  category — Recent reads from `getRecent()`; Drives reads from
  `ctx.drives`. Click an entry to navigate the active pane; click
  the same rail icon to close. Default open: `Recent`.
  Persisted under `settings.cmdRailOpen`.

### ~~Phase 6b.1 — Pane-activation refactor~~ (shipped)

`setActivePane()` no longer triggers a full `render()`. New
`applyActivePane(i)` in `app.js` toggles the active class on existing
pane cards (looked up by `data-pane-idx`) and rebuilds Fluent's
global `.a-statusbar` in place — no row DOM teardown. The
`e.stopPropagation()` workaround on `pane.js`'s row click is gone:
a single click in a non-active pane now both selects the row *and*
activates the pane, and double-clicking a folder in a non-active
pane opens it without the "click chrome first" detour. Cmd's
per-pane `b-pane__foot` is unaffected — it shows that pane's own
stats and doesn't depend on which pane is active.

### ~~Phase 6b.2 — Drag-and-drop between panes~~ (shipped)

HTML5 DnD wired in `src/pane.js`: rows are `draggable`, the rows
container handles `dragenter` / `dragover` / `dragleave` / `drop`.
A module-scope `activeDrag` cache holds the in-flight payload so
`dragover` can pick a same-drive vs cross-drive cursor (HTML5
hides dataTransfer values during drag, only the types list is
visible). `dragstart` selects the dragged row if it wasn't already
in the selection — matches stock Explorer. Modifier keys override
the default: Ctrl forces copy, Shift forces move; otherwise
same-drive = move, cross-drive = copy.

Drops route through a new `ctx.onDrop(srcIdx, dstIdx, names, op)`
in `app.js` that calls `fs.copy` / `fs.move` per item, reloads
both panes via `safeLoad`, and activates the destination pane so
post-drop state is sane. `fs.sameDrive(a, b)` (drive-letter
compare on normalized paths) lives next to the existing path
helpers. `text/uri-list` is also stuffed onto `dataTransfer` —
free groundwork for the Phase 7 OS-DnD work.

Visual cue: `.rows--drop` adds an inset accent ring + tinted
background while a foreign drag is over the destination pane;
an enter/leave depth counter avoids flicker as the cursor
crosses child elements.

### Phase 7 — Larger features (sequenced)

The flat list of "deferred" Phase 7 items is now broken into seven
sub-phases (7a–7g), ordered cheapest-and-most-visible first,
helper-dependent work batched together, terminal last because it is
the largest single bet. Total ~14–16 days. Each sub-phase ships on
its own `feat/phase-7…` branch off `origin/main` with a single
commit per CLAUDE.md's branch policy.

Summary:

| Sub-phase | Feature | Size | Helper? | Risk |
| --- | --- | --- | --- | --- |
| 7a | Mica + frameless chrome | 1d | no | low |
| 7b | Recursive search | 2d | no | low |
| 7c | OS DnD (drop side) | 1d | no | low |
| 7d | File preview pane (text/img/md/PDF) | 2d | no | low |
| 7e | Thumbnails + DnD egress (helper batch) | 3d | **yes** (new verbs) | med |
| 7f | Tree view | 2d | no | med (layout) |
| 7g | Integrated terminal | 3–5d | **yes** (ConPTY verb) | high |

#### 7a — Mica + frameless chrome (~1 day)

Smallest, most-visible, no helper / FS work. Closes the gap with
Direction A's design intent.

- Set `borderless: true` in `neutralino.config.json`.
- Custom title-bar component in `src/directions/fluent.js` with
  `Neutralino.window.setDraggableRegion` for the drag area; existing
  `─ ☐ ✕` controls stay (already wired in Phase 1).
- Apply Mica via WebView2's backdrop hint where available
  (`Neutralino.window.setMicaEffect()` if exposed; otherwise CSS
  acrylic/blur fallback for older Windows builds and non-Win11).
- Risk: Mica needs Win11 22H2+. Detect at runtime via `NL_OS` /
  build number; degrade to flat acrylic gracefully.

#### 7b — Recursive search (~2 days)

Pure JS over `Neutralino.filesystem.readDirectory`. Slots into the
existing palette (Cmd) and search input (Fluent). No helper work.

- New `src/search.js` with a cancellable async walker:
  BFS queue, chunked yields (~16 ms slice budget), AbortController
  for cancel. Skips reparse points and obvious noise (`node_modules`,
  `.git`) only when explicitly opted in via a settings toggle —
  default is "search everything visible".
- Cmd palette: when query has no `>`, `/`, `\`, or `<X>:` prefix and
  there's an active pane, palette flips to a "Search inside <pane
  path>…" mode after Enter.
- Fluent: existing `.searchInput` already filters visible rows on
  type; add Enter to escalate to a recursive walk. A new results
  view replaces the rows grid until cleared (Esc / clear button).
- Filename match only in v1 (substring, locale-aware,
  case-insensitive). Hit highlighting via a wrapper span around the
  matched substring.
- Cancel triggers: new keystroke, pane navigation, Esc, switching
  directions, switching panes.
- Out of scope: content search, regex, glob include/exclude UI.

#### 7c — OS DnD drop side (~1 day)

Receive drops from stock Explorer. The egress half (drag *out* of
SimpleExplorer) needs the native helper and is deferred to 7e.

- Wire `dragenter` / `dragover` / `drop` on the rows container in
  `src/pane.js` (already partially in place from 6b.2 for in-app
  drags).
- Read `dataTransfer.types`; when `Files` or `text/uri-list` is
  present, treat as a foreign drop and route through the existing
  `ctx.onDrop()` from 6b.2 with copy as the default and Shift = move.
- Drive-letter compare via `fs.sameDrive` decides cursor (already
  exists from 6b.2).
- Visual cue reuses the `.rows--drop` accent ring from 6b.2.
- Egress (dragging files *from* SimpleExplorer into Explorer)
  intentionally deferred — needs `DoDragDrop` in the helper. See 7e.

#### 7d — File preview pane (~2 days, includes PDF + markdown)

Right-side toggleable preview pane. No helper work. Establishes the
side-panel layout we'll reuse for thumbnails.

- New right-side pane in `src/directions/fluent.js` and
  `src/directions/cmd.js`, ~320 px default width, draggable splitter
  reusing `applyLayout`'s gutter mechanic. Toggleable via `Ctrl+P`
  and a Fluent command-bar button / Cmd rail icon. Persist toggle
  state per direction under `settings.preview.open`.
- New `src/preview.js` dispatch:
  - **Text** (`.txt`, `.json`, `.yaml`, `.toml`, `.ini`, `.log`,
    `.csv`, source files): chunked read, first 1 MB, monospace.
  - **Image** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`,
    `.ico`): `<img src="file:///…">`.
  - **Markdown** (`.md`): rendered HTML via a tiny inlined
    markdown-it (or hand-rolled CommonMark subset — heading, bold,
    italic, code, lists, links, images). Sandboxed (no script
    execution); links open via `Neutralino.os.open`.
  - **PDF** (`.pdf`): rendered via [`pdf.js`](https://mozilla.github.io/pdf.js/)
    embedded as a vendored `extras/pdfjs/` (or via the Mozilla CDN
    behind `Neutralino.extensions` if offline use isn't required).
    First-page render only in v1; pager controls deferred.
  - **Other** (binary / unknown): kind icon + size + modified date.
- Updates on selection change in the active pane (debounced 80 ms
  to avoid thrash during arrow-key navigation).
- Out of scope for v1: video / audio playback, syntax highlighting,
  diff view, multi-page PDF navigation.

#### 7e — Native helper batch: thumbnails + DnD egress (~3 days)

Both need new C++ verbs in `tools/shellhelp.cpp`; batched to share
build/test cycles.

- **Thumbnails** (`thumb` verb): `IShellItemImageFactory::GetImage`
  → emits PNG bytes on stdout (or a small temp file path printed to
  stdout for cleanliness; helper deletes on exit).
  - JS-side LRU keyed `path|mtime|requestedSize`; default cache 256
    entries, evict oldest. Tiles view consumes first; details view
    keeps kind icons (perf).
  - Async fill pattern from Phase 1.5 (curated first, helper fills
    in) — render kind icon synchronously, replace with thumb when
    helper returns.
  - Fallback: when helper missing, return early — kind icons stay.
- **DnD egress** (`dragout` verb): construct an `IDataObject` with
  `CF_HDROP` for the selected paths and call `DoDragDrop` with
  `DROPEFFECT_COPY | DROPEFFECT_MOVE`. The helper blocks while the
  user holds the mouse; on drop it returns the chosen effect on
  stdout so JS can decide whether to refresh the source pane.
  - JS triggers via `os.execCommand` on `dragstart` when the cursor
    is moving toward outside the app window. Detection heuristic:
    if `dragend` fires with `dataTransfer.dropEffect === 'none'` and
    the cursor is outside the window bounds, escalate to helper.
    (Cleaner alternative: always escalate; HTML5 in-app DnD from
    6b.2 stops working — too disruptive. Stick with the heuristic.)
- `tools/build.md` updated with the new verbs.
- `docs/design.md` "Native helpers" table extended.

#### 7f — Tree view (~2 days)

Sidebar tree of folders rooted at drives. Virtualized so 50 k+ node
trees stay snappy.

- New `src/tree.js`: windowed render — only the rows currently
  inside the scroll viewport are present in the DOM, padded with a
  spacer above/below to preserve scrollbar geometry. Row height
  fixed (24 px) so virtualization math stays trivial.
- Expand / collapse persists to `simple-explorer.tree.expanded` (set
  of paths). Lazy-loads children on first expand.
- Click a node = navigate the active pane to that folder.
  Right-click = same context menu as a row (curated + shell extensions
  via `helperMenu`).
- Sidebar gains a tab-style switcher between Tree / Quick access.
  Default keeps quick access (current behavior); user opt-in to tree.
- Risk: large drives / network shares can stall on initial
  enumeration. Mitigation: `readDirectory` per node is already
  async; show a spinner per row.

#### 7g — Integrated terminal in Direction B (~3–5 days)

Largest, riskiest single feature. Cmd direction only; the Fluent
skin keeps "Open in Terminal" as an external spawn.

- **Frontend:** [`xterm.js`](https://xtermjs.org/) (same emulator
  VS Code uses) rendered into a resizable bottom panel below
  `b-grid`. Toggleable via `Ctrl+\`` and a Cmd rail icon. Multiple
  terminals as tabs.
- **Backend:** new `pty` verb in `tools/shellhelp.cpp` wrapping
  the Windows [ConPTY](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)
  APIs (`CreatePseudoConsole`, `ResizePseudoConsole`,
  `ClosePseudoConsole`). Spawns the chosen shell under the PTY and
  pipes bytes both ways.
- **Shell selection** (matches VS Code): on first launch, detect
  shells in PATH (`pwsh.exe` → `powershell.exe` → `cmd.exe` →
  Git Bash → WSL); one-time quick-pick overlay; persist to
  `simple-explorer.terminal.shell`.
- **Working directory** (matches VS Code): new terminals open at
  the active pane's current path; thereafter independent — they do
  not follow pane navigation. Folder right-click gains "Open in
  integrated terminal".
- **IPC:** bidirectional bytes via `Neutralino.os.spawnProcess` +
  `events.on('spawnedProcess', …)`; stdin via
  `os.updateSpawnedProcess`. Resize events flow as JSON control
  messages on a sentinel-prefixed line.
- **Out of scope (v1):** split terminals, search, profile UI beyond
  the first-launch picker, session restore across app restarts.
- **Risks:** ConPTY escape-sequence translation imperfect (some
  TUI apps misbehave on resize); chunked output may need a 16 ms
  flush coalesce. Cheap fallback for Windows < 1809: plain
  `os.spawnProcess` without PTY semantics — works for line-oriented
  commands, breaks for vim/less.

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

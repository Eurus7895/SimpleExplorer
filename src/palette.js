// Cmd direction Ctrl+K palette. One overlay, three modes inferred from
// the query:
//
//   `> …`            command  — run a doAction verb
//   `/`, `\`, `<X>:` path     — fs.listDir-driven directory completion
//   anything else    search   — current pane entries + recents
//
// Single-instance: openPalette({...}) tears down any previous overlay
// before opening a new one. Dismissed by Esc, outside-click, or Enter
// (after running the highlighted entry).

import * as fs from './fs.js';
import { getRecent } from './pane.js';
import { iconHTML, kindFor } from './icons.js';

const COMMANDS = [
  { label: 'New folder',           verb: 'newfolder' },
  { label: 'New tab',              verb: 'tabNew' },
  { label: 'Close tab',            verb: 'tabClose' },
  { label: 'Rename selected',      verb: 'rename',     hint: 'F2' },
  { label: 'Delete to Recycle Bin', verb: 'delete',    hint: 'Del' },
  { label: 'Delete permanently',   verb: 'deletePerm', hint: 'Shift+Del' },
  { label: 'Copy to next pane',    verb: 'copy',       hint: 'F5' },
  { label: 'Move to next pane',    verb: 'move',       hint: 'F6' },
  { label: 'Compare with next pane', verb: 'compare' },
  { label: 'Open selected',        verb: 'openSelected' },
  { label: 'Open in VS Code',      verb: 'vscode' },
  { label: 'Open in Terminal',     verb: 'terminal' },
  { label: 'Open in PowerShell',   verb: 'powershell' },
  { label: 'Open in Cmd',          verb: 'cmd' },
  { label: 'Open in Git Bash',     verb: 'bash' },
  { label: 'Show in Explorer',     verb: 'reveal' },
  { label: 'Properties',           verb: 'properties' },
  { label: 'Copy path',            verb: 'copyPath' },
  { label: 'Refresh',              verb: 'refresh' },
  { label: 'Toggle theme',         verb: 'theme' },
];

const PATH_DEBOUNCE_MS = 100;

let active = null;

export function isPaletteOpen() {
  return active != null;
}

export function closePalette() {
  if (!active) return;
  active.overlay.remove();
  document.removeEventListener('mousedown', active.onOutside, true);
  active.input?.removeEventListener('keydown', active.onKey);
  active.input?.removeEventListener('input', active.onInput);
  active.onClose?.();
  active = null;
}

// Two opening modes:
//   - external input (Cmd direction): caller passes `input`, we attach
//     listeners to it; the existing search field doubles as the palette
//     input, the overlay is anchored under it.
//   - embedded input (Fluent direction): no `input` passed; we render
//     and focus our own. Without an `anchor`, the overlay is centered
//     near the top of the viewport like Spotlight / VS Code's palette.
export function openPalette({ anchor, input, ctx, getPane, onClose, initialQuery }) {
  closePalette();

  const overlay = document.createElement('div');
  overlay.className = 'palette';

  const modeChip = document.createElement('div');
  modeChip.className = 'palette__mode';
  overlay.appendChild(modeChip);

  let useInput = input;
  const ownsInput = !useInput;
  if (ownsInput) {
    useInput = document.createElement('input');
    useInput.className = 'palette__input';
    useInput.placeholder = 'Go to folder, search, or run a command';
    useInput.spellcheck = false;
    overlay.appendChild(useInput);
    overlay.classList.add('palette--standalone');
  }

  const list = document.createElement('div');
  list.className = 'palette__list';
  overlay.appendChild(list);

  document.body.appendChild(overlay);
  if (anchor) positionUnder(overlay, anchor);
  else positionFloat(overlay);

  if (initialQuery != null) {
    useInput.value = initialQuery;
    // Cursor at end so the user can extend the path / query.
    setTimeout(() => useInput.setSelectionRange(initialQuery.length, initialQuery.length), 0);
  }
  if (ownsInput) setTimeout(() => useInput.focus(), 0);

  const state = {
    overlay,
    anchor,
    input: useInput,
    ownsInput,
    list,
    modeChip,
    items: [],
    highlight: 0,
    pathTimer: null,
    onClose,
    onKey: null,
    onInput: null,
    onOutside: null,
  };

  const refresh = async () => {
    const q = useInput.value;
    const parsed = parseMode(q);
    state.modeChip.textContent = parsed.mode;
    state.modeChip.dataset.mode = parsed.mode;
    if (parsed.mode === 'path') {
      // Debounce listDir; the others are sync.
      clearTimeout(state.pathTimer);
      state.pathTimer = setTimeout(async () => {
        if (!active || active !== state) return;
        state.items = await pathResults(parsed, ctx);
        renderList(state, ctx);
      }, PATH_DEBOUNCE_MS);
      return;
    }
    if (parsed.mode === 'command') state.items = commandResults(parsed.query);
    else state.items = searchResults(parsed.query, getPane());
    renderList(state, ctx);
  };

  state.onInput = refresh;
  state.onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.highlight = Math.min(state.items.length - 1, state.highlight + 1);
      paintHighlight(state);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.highlight = Math.max(0, state.highlight - 1);
      paintHighlight(state);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = state.items[state.highlight];
      if (pick) runItem(pick, ctx, getPane());
      closePalette();
    }
  };
  state.onOutside = (e) => {
    if (overlay.contains(e.target)) return;
    if (anchor && anchor.contains(e.target)) return;
    closePalette();
  };

  useInput.addEventListener('input', state.onInput);
  useInput.addEventListener('keydown', state.onKey);
  // Capture-phase outside-click so the listener runs before any pane
  // mousedown rebinds focus.
  setTimeout(() => document.addEventListener('mousedown', state.onOutside, true), 0);

  active = state;
  refresh();
}

function parseMode(q) {
  const trimmed = q ?? '';
  if (trimmed.startsWith('>')) return { mode: 'command', query: trimmed.slice(1).trim() };
  // Drive letter (Windows): C:, C:\, C:\path
  if (/^[A-Za-z]:/.test(trimmed)) return { mode: 'path', query: trimmed };
  // Absolute POSIX or Windows root
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return { mode: 'path', query: trimmed };
  return { mode: 'search', query: trimmed };
}

function commandResults(query) {
  const q = query.toLowerCase();
  const all = COMMANDS.map((c) => ({ ...c, kind: 'command' }));
  if (!q) return all;
  return all.filter((c) => c.label.toLowerCase().includes(q));
}

function searchResults(query, pane) {
  const q = query.toLowerCase();
  const out = [];
  // Escalation entry: when there's a query AND a pane to search inside,
  // the first row offers a recursive walk. Picking it (Enter / click)
  // dispatches via ctx.onRecursiveSearch and replaces the pane's rows.
  if (q && pane?.path) {
    out.push({
      kind: 'recursive',
      label: `Search "${query}" inside this folder`,
      hint: pane.path,
      query,
    });
  }
  if (q && pane?.entries) {
    for (const e of pane.entries) {
      if (e.name.toLowerCase().includes(q)) {
        out.push({ kind: 'entry', label: e.name, hint: e.is_dir ? 'Folder' : (e.extension || '').toUpperCase(), entry: e, pane });
      }
    }
  }
  const recent = getRecent();
  for (const p of recent) {
    if (!q || p.toLowerCase().includes(q)) {
      out.push({ kind: 'recent', label: shortLabel(p), hint: p, path: p });
    }
  }
  return out.slice(0, 50);
}

async function pathResults(parsed, ctx) {
  const raw = parsed.query;
  const win = /^[A-Za-z]:/.test(raw) || raw.includes('\\');
  const sep = win ? '\\' : '/';
  // Split into parent + tail. If raw ends with sep, parent is raw, tail is ''.
  let parent;
  let tail;
  if (raw.endsWith(sep)) {
    parent = raw;
    tail = '';
  } else {
    const i = raw.lastIndexOf(sep);
    if (i === -1) {
      // "C:" without trailing slash → parent = "C:\\".
      if (/^[A-Za-z]:$/.test(raw)) { parent = raw + '\\'; tail = ''; }
      else { parent = raw; tail = ''; }
    } else {
      parent = raw.slice(0, i + 1);
      tail = raw.slice(i + 1).toLowerCase();
    }
  }
  const norm = fs.normalizePath(parent);
  let entries = [];
  try { entries = await fs.listDir(norm); } catch {}
  const dirs = entries.filter((e) => e.is_dir && (!tail || e.name.toLowerCase().startsWith(tail)));
  return dirs.slice(0, 50).map((e) => ({
    kind: 'path',
    label: e.name,
    hint: fs.joinPath(norm, e.name),
    path: fs.joinPath(norm, e.name),
    entry: e,
  }));
}

function renderList(state, ctx) {
  state.list.innerHTML = '';
  state.highlight = 0;
  if (!state.items.length) {
    const empty = document.createElement('div');
    empty.className = 'palette__empty';
    empty.textContent = 'No results';
    state.list.appendChild(empty);
    return;
  }
  state.items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'palette__row' + (i === 0 ? ' palette__row--active' : '');
    row.dataset.idx = String(i);
    const icon = iconForItem(it);
    row.innerHTML = `${icon}<span class="palette__label">${escapeHtml(it.label)}</span>${it.hint ? `<span class="palette__hint">${escapeHtml(it.hint)}</span>` : ''}`;
    row.addEventListener('mouseenter', () => {
      state.highlight = i;
      paintHighlight(state);
    });
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      runItem(it, ctx, state.input?.dataset?.paneIdx ? null : null);
      closePalette();
    });
    state.list.appendChild(row);
  });
}

function paintHighlight(state) {
  state.list.querySelectorAll('.palette__row').forEach((r, i) => {
    r.classList.toggle('palette__row--active', i === state.highlight);
  });
  const active = state.list.querySelector('.palette__row--active');
  active?.scrollIntoView({ block: 'nearest' });
}

function runItem(item, ctx, pane) {
  if (item.kind === 'command') {
    document.dispatchEvent(new CustomEvent('explorer:action', { detail: item.verb }));
    return;
  }
  if (item.kind === 'recent' || item.kind === 'path') {
    ctx.onPaneNav(ctx.activePane, item.path);
    return;
  }
  if (item.kind === 'entry') {
    ctx.onActivateEntry(ctx.activePane, item.entry);
    return;
  }
  if (item.kind === 'recursive') {
    ctx.onRecursiveSearch?.(ctx.activePane, item.query);
  }
}

function iconForItem(it) {
  if (it.kind === 'command') return iconHTML('cmd', 13);
  if (it.kind === 'recent') return iconHTML('clock', 13);
  if (it.kind === 'path') return iconHTML('folder', 13);
  if (it.kind === 'entry') return iconHTML(kindFor(it.entry), 13);
  if (it.kind === 'recursive') return iconHTML('search', 13);
  return iconHTML('file', 13);
}

function shortLabel(p) {
  const segs = p.split(/[\\/]/).filter(Boolean);
  return segs[segs.length - 1] || p;
}

function positionUnder(overlay, anchor) {
  const r = anchor.getBoundingClientRect();
  overlay.style.position = 'fixed';
  overlay.style.left = r.left + 'px';
  overlay.style.top = (r.bottom + 4) + 'px';
  overlay.style.width = r.width + 'px';
}

// Standalone (Fluent) palette: centered horizontally near the top of
// the viewport, fixed width — Spotlight / VS Code shape.
function positionFloat(overlay) {
  overlay.style.position = 'fixed';
  overlay.style.left = '50%';
  overlay.style.top = '15%';
  overlay.style.transform = 'translateX(-50%)';
  overlay.style.width = '520px';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

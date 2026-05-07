// Pane: a list of files for one folder. Shared engine for all 3 directions.
// Variants only differ in chrome around the pane (see directions/*.js).
//
// State per pane:  { id, path, history, historyIdx, selected (Set), entries }

import { iconHTML, kindFor } from './icons.js';
import * as fs from './fs.js';

const RECENT_KEY = 'simple-explorer.recent';
const MAX_RECENT = 12;

export function createPaneState(id, initialPath) {
  return {
    id,
    path: initialPath,
    history: [initialPath],
    historyIdx: 0,
    selected: new Set(),
    entries: [],
    loading: false,
    filter: '',
  };
}

export async function loadPath(state, path) {
  const norm = fs.normalizePath(path);
  state.loading = true;
  state.path = norm;
  state.entries = [];
  state.selected.clear();
  try {
    state.entries = await fs.listDir(norm);
  } catch (e) {
    state.entries = [];
    console.warn('listDir failed', norm, e);
  }
  state.loading = false;
  pushRecent(norm);
}

export async function navigate(state, path) {
  const norm = fs.normalizePath(path);
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(norm);
  state.historyIdx = state.history.length - 1;
  await loadPath(state, norm);
}

export async function goBack(state) {
  if (state.historyIdx <= 0) return;
  state.historyIdx -= 1;
  await loadPath(state, state.history[state.historyIdx]);
}

export async function goForward(state) {
  if (state.historyIdx >= state.history.length - 1) return;
  state.historyIdx += 1;
  await loadPath(state, state.history[state.historyIdx]);
}

export async function goUp(state) {
  await navigate(state, fs.parentPath(state.path));
}

export function pushRecent(path) {
  try {
    const norm = fs.normalizePath(path);
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      .map((p) => fs.normalizePath(p));
    const next = [norm, ...list.filter((p) => p !== norm)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

// Reads recents, normalizing each entry and dropping duplicates that arose
// before the path normalization was added (e.g. /C: and C:\ collapse to one).
export function getRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const seen = new Set();
    const out = [];
    for (const p of raw) {
      const n = fs.normalizePath(p);
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

// ── Renderers ──────────────────────────────────────────────────────────

export function renderRows(state, opts = {}) {
  const { onActivate, density = 'normal', accent } = opts;
  const items = filtered(state);
  const list = document.createElement('div');
  list.className = 'rows';
  if (density === 'cmd') list.classList.add('rows--cmd');
  if (density === 'ws') list.classList.add('rows--ws');

  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.name = it.name;
    if (state.selected.has(it.name)) row.classList.add('row--sel');
    if (accent) row.style.setProperty('--row-accent', accent);

    const nameCell = document.createElement('span');
    nameCell.className = 'row__name';
    nameCell.innerHTML = `${iconHTML(kindFor(it))}<span class="row__label">${escapeHtml(it.name)}</span>`;

    const sizeCell = document.createElement('span');
    sizeCell.className = 'row__size';
    sizeCell.textContent = it.is_dir ? '' : fs.formatSize(it.size);

    const modCell = document.createElement('span');
    modCell.className = 'row__mod';
    modCell.textContent = fs.formatModified(it.modified_ms);

    const kindCell = document.createElement('span');
    kindCell.className = 'row__kind';
    kindCell.textContent = it.is_dir ? 'Folder' : (it.extension || 'File').toUpperCase();

    row.append(nameCell, sizeCell, modCell, kindCell);

    row.addEventListener('click', (e) => {
      // Don't bubble to the pane card — the card's click handler triggers
      // setActivePane → render(), which would tear the row out from under
      // an in-progress double-click and silently swallow it.
      e.stopPropagation();
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (state.selected.has(it.name)) state.selected.delete(it.name);
        else state.selected.add(it.name);
      } else {
        state.selected.clear();
        state.selected.add(it.name);
      }
      list.querySelectorAll('.row').forEach((r) => {
        r.classList.toggle('row--sel', state.selected.has(r.dataset.name));
      });
    });

    row.addEventListener('dblclick', () => {
      onActivate?.(it);
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!state.selected.has(it.name)) {
        state.selected.clear();
        state.selected.add(it.name);
        list.querySelectorAll('.row').forEach((r) => {
          r.classList.toggle('row--sel', state.selected.has(r.dataset.name));
        });
      }
      const paths = [...state.selected].map((n) => fs.joinPath(state.path, n));
      showContextMenu(e.clientX, e.clientY, it, paths);
    });

    list.appendChild(row);
  });

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'rows__empty';
    empty.textContent = state.filter ? 'No matches' : (state.loading ? 'Loading…' : 'Empty');
    list.appendChild(empty);
  }

  return list;
}

export function filtered(state) {
  if (!state.filter) return state.entries;
  const q = state.filter.toLowerCase();
  return state.entries.filter((e) => e.name.toLowerCase().includes(q));
}

export function renderColumnHeader(direction) {
  const head = document.createElement('div');
  head.className = 'cols';
  if (direction === 'ws') head.classList.add('cols--ws');
  head.innerHTML = `
    <span>Name <span class="icn">${iconHTML('sort', 10)}</span></span>
    <span>Size</span>
    <span>Modified</span>
    <span>Type</span>
  `;
  return head;
}

export function renderBreadcrumb(path, onSegmentClick) {
  const wrap = document.createElement('div');
  wrap.className = 'crumbs';
  wrap.innerHTML = iconHTML('home', 13);
  const segs = fs.pathSegments(path);
  const win = path.includes('\\');
  segs.forEach((seg, i) => {
    const sep = document.createElement('span');
    sep.className = 'crumbs__sep';
    sep.textContent = '›';
    wrap.appendChild(sep);
    const isLast = i === segs.length - 1;
    const part = document.createElement('span');
    part.className = 'crumbs__seg' + (isLast ? ' crumbs__seg--last' : '');
    part.textContent = seg;
    if (!isLast && onSegmentClick) {
      const target = buildSegPath(segs, i, win);
      part.style.cursor = 'pointer';
      part.addEventListener('click', (e) => { e.stopPropagation(); onSegmentClick(target); });
    }
    wrap.appendChild(part);
  });
  return wrap;
}

function buildSegPath(segs, idx, win) {
  const parts = segs.slice(0, idx + 1);
  if (win) {
    // First segment is the drive ("C:") — always keep its trailing slash.
    if (parts.length === 1) return parts[0] + '\\';
    return parts.join('\\');
  }
  return '/' + parts.join('/');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// SimpleExplorer-specific items (Open in active pane, Compare, Copy path,
// Rename, Delete) that don't appear in IContextMenu. Rendered first; the
// shell extensions fill in below an "Other actions" separator.
const CURATED_ITEMS = [
  { label: 'Open',              act: 'openSelected' },
  { label: 'Open in VS Code',   act: 'vscode' },
  { label: 'Open in Terminal',  act: 'terminal', dirOnly: true },
  null,
  { label: 'Copy path',         act: 'copyPath' },
  { label: 'Rename',            act: 'rename', kbd: 'F2' },
  { label: 'Delete',            act: 'delete', kbd: 'Del' },
  null,
  { label: 'Show in Explorer',  act: 'reveal' },
  { label: 'Properties',        act: 'properties' },
];

// 3-second TTL cache so repeat right-clicks of the same selection don't
// re-walk COM. Keyed by paths.join('\\0').
const SHELL_MENU_CACHE = new Map();
const SHELL_MENU_TTL_MS = 3000;

let openMenus = [];

function dismissAllMenus() {
  openMenus.forEach((m) => m.remove());
  openMenus = [];
}

// Right-click menu. Items dispatch an 'explorer:action' CustomEvent that
// app.js routes through doAction(); shell-extension items invoke the
// helper exe directly. Closes on outside click or Escape.
function showContextMenu(x, y, entry, paths) {
  dismissAllMenus();

  const menu = createMenuEl();
  buildCurated(menu, entry);

  // Placeholder that the async helper fill replaces.
  const sep = document.createElement('div');
  sep.className = 'ctx-menu__sep';
  menu.appendChild(sep);
  const loading = document.createElement('div');
  loading.className = 'ctx-menu__item ctx-menu__item--loading';
  loading.innerHTML = '<span>Loading shell extensions…</span>';
  menu.appendChild(loading);

  document.body.appendChild(menu);
  positionAt(menu, x, y);
  openMenus.push(menu);
  attachDismiss();

  // Try the cache first; otherwise fetch from the helper.
  const key = paths.join('\0');
  const cached = SHELL_MENU_CACHE.get(key);
  if (cached && Date.now() - cached.ts < SHELL_MENU_TTL_MS) {
    fillShellSection(menu, sep, loading, cached.json, paths);
    return;
  }
  fs.helperMenu(paths).then((json) => {
    if (!menu.isConnected) return;
    if (json) SHELL_MENU_CACHE.set(key, { ts: Date.now(), json });
    fillShellSection(menu, sep, loading, json, paths);
  }).catch(() => {
    fillShellSection(menu, sep, loading, null, paths);
  });
}

function createMenuEl() {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  return menu;
}

function buildCurated(menu, entry) {
  CURATED_ITEMS.forEach((it) => {
    if (!it) {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu__sep';
      menu.appendChild(sep);
      return;
    }
    if (it.dirOnly && !entry.is_dir) return;
    const row = document.createElement('div');
    row.className = 'ctx-menu__item';
    row.innerHTML = `<span>${escapeHtml(it.label)}</span>${it.kbd ? `<span class="ctx-menu__kbd">${it.kbd}</span>` : ''}`;
    row.addEventListener('click', () => {
      dismissAllMenus();
      document.dispatchEvent(new CustomEvent('explorer:action', { detail: it.act }));
    });
    menu.appendChild(row);
  });
}

// Replaces the loading placeholder with shell-extension entries. When the
// helper isn't available (mock mode, exe not yet compiled), the curated
// items above are the whole menu — drop the loading placeholder + leading
// separator silently.
function fillShellSection(menu, sep, loading, json, paths) {
  loading.remove();
  if (!json || !json.length) {
    sep.remove();
    return;
  }
  appendMenuEntries(menu, json, paths);
}

function appendMenuEntries(parentEl, entries, paths) {
  entries.forEach((entry) => {
    if (entry.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu__sep';
      parentEl.appendChild(sep);
      return;
    }
    if (!entry.label) return;
    const row = document.createElement('div');
    row.className = 'ctx-menu__item';
    if (entry.disabled) row.classList.add('ctx-menu__item--disabled');
    if (entry.submenu) row.classList.add('ctx-menu__item--submenu');

    const label = document.createElement('span');
    label.textContent = entry.label.replace(/&/g, ''); // strip Win mnemonic accelerators
    row.appendChild(label);

    if (entry.submenu) {
      const arrow = document.createElement('span');
      arrow.className = 'ctx-menu__arrow';
      arrow.textContent = '›';
      row.appendChild(arrow);
      bindSubmenuHover(row, entry.submenu, paths);
    } else if (!entry.disabled) {
      row.addEventListener('click', () => {
        dismissAllMenus();
        fs.helperInvoke(entry.id, paths);
      });
    }

    parentEl.appendChild(row);
  });
}

function bindSubmenuHover(parentRow, submenuEntries, paths) {
  let openTimer = null;
  let childMenu = null;

  const openChild = () => {
    if (childMenu) return;
    // Close sibling submenus opened from this parent's menu.
    const myMenu = parentRow.parentElement;
    const idx = openMenus.indexOf(myMenu);
    if (idx !== -1) {
      // Close any submenus deeper than this one.
      openMenus.slice(idx + 1).forEach((m) => m.remove());
      openMenus = openMenus.slice(0, idx + 1);
    }
    childMenu = createMenuEl();
    appendMenuEntries(childMenu, submenuEntries, paths);
    document.body.appendChild(childMenu);
    const r = parentRow.getBoundingClientRect();
    positionSubmenu(childMenu, r);
    openMenus.push(childMenu);
  };

  parentRow.addEventListener('mouseenter', () => {
    clearTimeout(openTimer);
    openTimer = setTimeout(openChild, 200);
  });
  parentRow.addEventListener('mouseleave', () => {
    clearTimeout(openTimer);
  });
  parentRow.addEventListener('click', () => {
    clearTimeout(openTimer);
    openChild();
  });
}

function positionAt(menu, x, y) {
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - w - 4) + 'px';
  menu.style.top  = Math.min(y, vh - h - 4) + 'px';
}

function positionSubmenu(menu, parentRect) {
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = parentRect.right - 2;
  if (left + w > vw - 4) left = parentRect.left - w + 2;
  if (left < 4) left = 4;
  let top = parentRect.top - 4;
  if (top + h > vh - 4) top = vh - h - 4;
  if (top < 4) top = 4;
  menu.style.left = left + 'px';
  menu.style.top  = top + 'px';
}

let dismissAttached = false;
function attachDismiss() {
  if (dismissAttached) return;
  dismissAttached = true;
  const onMouseDown = (e) => {
    if (openMenus.some((m) => m.contains(e.target))) return;
    dismissAllMenus();
    detach();
  };
  const onKey = (e) => { if (e.key === 'Escape') { dismissAllMenus(); detach(); } };
  const detach = () => {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('keydown', onKey, true);
    dismissAttached = false;
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

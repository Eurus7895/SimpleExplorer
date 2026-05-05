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
  state.loading = true;
  state.path = path;
  state.entries = [];
  state.selected.clear();
  try {
    state.entries = await fs.listDir(path);
  } catch (e) {
    state.entries = [];
    console.warn('listDir failed', path, e);
  }
  state.loading = false;
  pushRecent(path);
}

export async function navigate(state, path) {
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(path);
  state.historyIdx = state.history.length - 1;
  await loadPath(state, path);
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
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const next = [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

export function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
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
      showContextMenu(e.clientX, e.clientY, it);
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

export function renderBreadcrumb(path) {
  const wrap = document.createElement('div');
  wrap.className = 'crumbs';
  wrap.innerHTML = iconHTML('home', 13);
  const segs = fs.pathSegments(path);
  segs.forEach((seg, i) => {
    const sep = document.createElement('span');
    sep.className = 'crumbs__sep';
    sep.textContent = '›';
    wrap.appendChild(sep);
    const part = document.createElement('span');
    part.className = 'crumbs__seg' + (i === segs.length - 1 ? ' crumbs__seg--last' : '');
    part.textContent = seg;
    wrap.appendChild(part);
  });
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Right-click menu. Items dispatch an 'explorer:action' CustomEvent that
// app.js routes through doAction(). Closes on outside click or Escape.
function showContextMenu(x, y, entry) {
  document.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  const items = [
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
  items.forEach((it) => {
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
      menu.remove();
      document.dispatchEvent(new CustomEvent('explorer:action', { detail: it.act }));
    });
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - w - 4) + 'px';
  menu.style.top  = Math.min(y, vh - h - 4) + 'px';

  const dismiss = (e) => {
    if (menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') dismiss(e); };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

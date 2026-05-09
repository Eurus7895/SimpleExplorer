// Folder tree for the Fluent sidebar.
//
// Single-level lazy fetch: each expanded folder calls fs.listDir on demand
// and caches the result on the node. Children are kept across collapse so
// re-expanding is instant.
//
// Persistence: the set of expanded paths is serialized to localStorage
// under TREE_KEY so the tree opens to the same shape across launches.
// Drives are seeded from ctx.drives on each render.
//
// v1 is not virtualized -- every visible node is in the DOM. With a
// reasonable depth (a few hundred visible nodes) this is fast enough;
// scaling to 10 k+ visible nodes would want a windowed renderer, tracked
// as future work.

import { iconHTML } from './icons.js';
import * as fs from './fs.js';

const TREE_KEY = 'simple-explorer.tree.expanded';

// path -> { children: [{name, path, is_dir}] | null, loading: bool }
const nodeCache = new Map();
const expanded = loadExpanded();

function loadExpanded() {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function saveExpanded() {
  try { localStorage.setItem(TREE_KEY, JSON.stringify([...expanded])); }
  catch {}
}

export function isExpanded(path) {
  return expanded.has(normalize(path));
}

export function setExpanded(path, isOpen) {
  const norm = normalize(path);
  if (isOpen) expanded.add(norm);
  else expanded.delete(norm);
  saveExpanded();
}

function normalize(p) {
  return (p || '').replace(/[\\/]+$/, '');
}

// Roots are typically the drive list. Each root is { label, path }.
export function renderTree(container, { roots, onNavigate, activePath }) {
  container.innerHTML = '';
  roots.forEach((r) => {
    container.appendChild(renderNode({
      name: r.label, path: r.path, is_dir: true,
    }, 0, { onNavigate, activePath, container }));
  });
}

function renderNode(entry, depth, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'tree__node';
  const row = document.createElement('div');
  row.className = 'tree__row';
  if (normalize(entry.path) === normalize(ctx.activePath)) row.classList.add('tree__row--active');
  row.style.paddingLeft = (depth * 14 + 8) + 'px';

  const isOpen = isExpanded(entry.path);
  const chev = document.createElement('span');
  chev.className = 'tree__chev' + (isOpen ? ' tree__chev--open' : '');
  chev.textContent = '›';
  row.appendChild(chev);

  const ico = document.createElement('span');
  ico.className = 'tree__ico';
  ico.innerHTML = iconHTML(depth === 0 ? 'drive' : 'folder', 13);
  row.appendChild(ico);

  const label = document.createElement('span');
  label.className = 'tree__label';
  label.textContent = entry.name;
  label.title = entry.path;
  row.appendChild(label);

  // Single click on the chevron toggles; click on the row navigates.
  // This matches stock Explorer's tree -- no surprise.
  chev.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(entry, wrap, depth, ctx);
  });
  row.addEventListener('click', () => {
    ctx.onNavigate?.(entry.path);
  });
  row.addEventListener('dblclick', () => {
    toggle(entry, wrap, depth, ctx);
  });

  wrap.appendChild(row);
  if (isOpen) ensureChildren(entry, wrap, depth, ctx);
  return wrap;
}

async function toggle(entry, wrap, depth, ctx) {
  const open = isExpanded(entry.path);
  setExpanded(entry.path, !open);
  // Update chev visual without rebuilding the whole row.
  const chev = wrap.querySelector(':scope > .tree__row > .tree__chev');
  chev?.classList.toggle('tree__chev--open', !open);
  // Drop any existing child container.
  wrap.querySelectorAll(':scope > .tree__children').forEach((n) => n.remove());
  if (!open) ensureChildren(entry, wrap, depth, ctx);
}

async function ensureChildren(entry, wrap, depth, ctx) {
  const childrenWrap = document.createElement('div');
  childrenWrap.className = 'tree__children';
  wrap.appendChild(childrenWrap);

  const cached = nodeCache.get(normalize(entry.path));
  if (cached?.children) {
    cached.children.forEach((c) => childrenWrap.appendChild(renderNode(c, depth + 1, ctx)));
    return;
  }
  const placeholder = document.createElement('div');
  placeholder.className = 'tree__loading';
  placeholder.style.paddingLeft = ((depth + 1) * 14 + 8) + 'px';
  placeholder.textContent = 'Loading…';
  childrenWrap.appendChild(placeholder);

  let listed = [];
  try { listed = await fs.listDir(entry.path); }
  catch { listed = []; }
  const dirs = listed.filter((e) => e.is_dir).map((e) => ({
    name: e.name, path: e.path, is_dir: true,
  }));
  nodeCache.set(normalize(entry.path), { children: dirs });
  // Re-check expanded — user may have collapsed during the async fetch.
  if (!isExpanded(entry.path)) return;
  childrenWrap.innerHTML = '';
  if (!dirs.length) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.style.paddingLeft = ((depth + 1) * 14 + 8) + 'px';
    empty.textContent = 'Empty';
    childrenWrap.appendChild(empty);
    return;
  }
  dirs.forEach((c) => childrenWrap.appendChild(renderNode(c, depth + 1, ctx)));
}

// Drop any cached children for `path` so the next expand re-fetches.
// Called after FS-mutating actions (rename / delete / move) so the tree
// stays honest with disk contents.
export function invalidateTreePath(path) {
  nodeCache.delete(normalize(path));
}

// Direction B — Command-bar first
// Minimal chrome, ⌘K is path/search/commands. Rail sidebar, scope-chip pane
// header. Visuals trace explorer-cmd.jsx in the design bundle.

import { iconHTML } from '../icons.js';
import { renderRows, buildSegPath } from '../pane.js';
import { RAIL_ITEMS } from '../sidebar-data.js';
import { applyLayout } from '../layout.js';
import { openPalette, closePalette } from '../palette.js';
import * as fs from '../fs.js';

const LAYOUT_OPTS = [
  { id: '1',  icn: 'one' },
  { id: '2v', icn: 'split-h' },
  { id: '2h', icn: 'split-v' },
  { id: '3',  icn: 'workspace' },
  { id: '4',  icn: 'grid4' },
];

export function renderCmd(root, ctx) {
  root.innerHTML = '';
  const app = el('div', 'b-app');

  app.appendChild(topBar(ctx));

  const body = el('div', 'b-body');
  body.appendChild(rail(ctx));

  const grid = el('div', 'b-grid');
  const cards = ctx.panes.slice(0, ctx.layoutDef.panes).map((pane, i) => paneCard(ctx, pane, i));
  applyLayout(grid, ctx.layout, ctx.splits, cards, ctx.onSplitChange);

  body.appendChild(grid);
  app.appendChild(body);
  root.appendChild(app);
}

function topBar(ctx) {
  const bar = el('div', 'b-topbar');
  bar.innerHTML = `
    <div class="b-brand">
      <div class="b-brand__logo"></div>
      SimpleExplorer
    </div>
    <span class="b-sep"></span>
    <button class="iconbtn" data-nav="back">${iconHTML('back')}</button>
    <button class="iconbtn" data-nav="fwd">${iconHTML('fwd')}</button>
    <div class="b-cmdpalette">
      ${iconHTML('search', 14)}
      <input data-palette placeholder="Go to folder, search, or run a command" />
      <kbd>Ctrl K</kbd>
    </div>
    <div class="spacer"></div>
    ${directionSwitcher(ctx)}
    ${layoutPicker(ctx)}
    <button class="iconbtn" data-act="theme" title="Toggle theme">${iconHTML(ctx.theme === 'dark' ? 'sun' : 'moon')}</button>
  `;
  bindClicks(bar, ctx);
  bindNav(bar, ctx);
  bindLayout(bar, ctx);
  bindPalette(bar, ctx);
  return bar;
}

function rail(ctx) {
  const r = el('div', 'b-rail');
  RAIL_ITEMS.forEach((it) => {
    const btn = el('button', 'b-rail__btn');
    btn.title = it.label;
    btn.innerHTML = iconHTML(it.icon, 16);
    const target = ctx.railTarget(it.key);
    if (target) btn.addEventListener('click', () => ctx.onPaneNav(ctx.activePane, target));
    else btn.disabled = true; // pinned/recent/drives popovers — out of MVP scope
    r.appendChild(btn);
  });
  const spacer = el('div', 'spacer');
  r.appendChild(spacer);
  const more = el('button', 'b-rail__btn');
  more.innerHTML = iconHTML('more');
  r.appendChild(more);
  return r;
}

function paneCard(ctx, pane, i) {
  const card = el('div', 'b-pane' + (i === ctx.activePane ? ' b-pane--active' : ''));
  card.addEventListener('click', () => ctx.setActivePane(i));

  const head = el('div', 'b-pane__head');
  head.appendChild(chip(ctx, pane, i));
  const spacer = el('div', 'spacer');
  head.appendChild(spacer);
  head.insertAdjacentHTML('beforeend', `
    <button class="iconbtn iconbtn--sm" title="View">${iconHTML('list', 14)}</button>
    <button class="iconbtn iconbtn--sm" title="Sort">${iconHTML('sort', 14)}</button>
    <button class="iconbtn iconbtn--sm" title="More">${iconHTML('more', 14)}</button>
  `);
  card.appendChild(head);

  const rows = renderRows(pane, {
    density: 'cmd',
    onActivate: (entry) => ctx.onActivateEntry(i, entry),
    onPaneActivate: () => ctx.setActivePane(i),
  });
  card.appendChild(rows);

  const foot = el('div', 'b-pane__foot');
  const sel = [...pane.selected];
  foot.innerHTML = `
    <span>${pane.entries.length} items</span>
    ${sel.length ? `<span>· ${sel[0]}${sel.length > 1 ? ` +${sel.length - 1}` : ''} selected</span>` : ''}
  `;
  card.appendChild(foot);
  return card;
}

function chip(ctx, pane, paneIdx) {
  const wrap = el('div', 'b-chip');
  wrap.insertAdjacentHTML('beforeend', iconHTML('folder-open', 13));
  // Inner container so each segment is its own click target, but the
  // chip's flex `gap` doesn't insert space between every segment — slashes
  // provide the visual separation.
  const segWrap = el('span', 'b-chip__segs');
  const segs = fs.pathSegments(pane.path);
  const win = pane.path.includes('\\');
  const lastIdx = segs.length - 1;
  segs.forEach((seg, i) => {
    const isLast = i === lastIdx;
    const span = el('span', isLast ? 'b-chip__last' : 'b-chip__pre');
    span.textContent = isLast ? seg : seg + '/';
    if (!isLast) {
      const target = buildSegPath(segs, i, win);
      span.classList.add('b-chip__seg');
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.onPaneNav(paneIdx, target);
      });
    }
    segWrap.appendChild(span);
  });
  if (!segs.length) {
    const span = el('span', 'b-chip__last');
    span.textContent = 'home';
    segWrap.appendChild(span);
  }
  wrap.appendChild(segWrap);
  wrap.insertAdjacentHTML('beforeend', iconHTML('fwd', 10));
  return wrap;
}

function layoutPicker(ctx) {
  return `<div class="b-layout">${LAYOUT_OPTS.map((o) => `
    <button data-layout="${o.id}" class="${ctx.layout === o.id ? 'on' : ''}">${iconHTML(o.icn, 13)}</button>
  `).join('')}</div>`;
}

function directionSwitcher(ctx) {
  const opts = [
    { id: 'fluent', label: 'Fluent' },
    { id: 'cmd',    label: 'Cmd' },
  ];
  return `<div class="dir-switch">${opts.map((o) => `
    <button data-dir="${o.id}" class="${ctx.direction === o.id ? 'on' : ''}">${o.label}</button>
  `).join('')}</div>`;
}

function bindClicks(scope, ctx) {
  scope.querySelectorAll('[data-act]').forEach((el) =>
    el.addEventListener('click', () => ctx.onAction(el.dataset.act)));
  scope.querySelectorAll('[data-action]').forEach((el) =>
    el.addEventListener('click', () => ctx.onAction(el.dataset.action)));
  scope.querySelectorAll('[data-dir]').forEach((el) =>
    el.addEventListener('click', () => ctx.setDirection(el.dataset.dir)));
}

function bindNav(scope, ctx) {
  scope.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => {
    if (el.dataset.nav === 'back') ctx.onPaneBack(ctx.activePane);
    else if (el.dataset.nav === 'fwd') ctx.onPaneForward(ctx.activePane);
    else if (el.dataset.nav === 'up') ctx.onPaneUp(ctx.activePane);
  }));
}

function bindLayout(scope, ctx) {
  scope.querySelectorAll('[data-layout]').forEach((el) =>
    el.addEventListener('click', () => ctx.setLayout(el.dataset.layout)));
}

function bindPalette(scope, ctx) {
  const input = scope.querySelector('[data-palette]');
  if (!input) return;
  // Open the palette overlay on focus or when something is typed. Closing
  // is owned by palette.js (Esc / outside-click / Enter).
  const open = () => openPalette({
    anchor: input,
    input,
    ctx,
    getPane: () => ctx.panes[ctx.activePane],
    onClose: () => { input.value = ''; },
  });
  input.addEventListener('focus', open);
  input.addEventListener('input', () => { if (input.value) open(); });
  // Direction-level Ctrl+K handled here; the global handler in app.js
  // also calls focus() on this input when active direction is cmd.
  scope.dataset.paletteAnchor = '1';
  // Expose the input so app.js's global Ctrl+K handler can find it.
  input.classList.add('cmd-palette-input');
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

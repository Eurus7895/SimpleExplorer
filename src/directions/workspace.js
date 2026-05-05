// Direction C — Workspaces
// Saved pane sets switched like browser tabs. Each pane gets a tinted accent
// stripe. Pane-pair actions (Copy →, Compare) appear when 2+ panes.
// Visuals trace explorer-workspace.jsx in the design bundle.

import { iconHTML } from '../icons.js';
import { renderRows, getRecent } from '../pane.js';
import * as fs from '../fs.js';

const ACCENTS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444'];

const LAYOUT_OPTS = [
  { id: '1',  icn: 'one' },
  { id: '2v', icn: 'split-h' },
  { id: '2h', icn: 'split-v' },
  { id: '3',  icn: 'workspace' },
  { id: '4',  icn: 'grid4' },
];

const WORKSPACES = [
  { name: 'Qt project',   icon: 'workspace', count: 2 },
  { name: 'Triage',       icon: 'down',      count: 1 },
  { name: 'Compare runs', icon: 'compare',   count: 4 },
  { name: 'Research',     icon: 'doc',       count: 2 },
];

const PANE_LABELS = ['Source', 'Qt SDK', 'Inbox', 'Reference'];

export function renderWorkspace(root, ctx) {
  root.innerHTML = '';
  const app = el('div', 'c-app');

  app.appendChild(topBar(ctx));

  const body = el('div', 'c-body');
  body.appendChild(sidebar(ctx));

  const grid = el('div', 'c-grid');
  grid.style.gridTemplateColumns = ctx.layoutDef.cols;
  grid.style.gridTemplateRows = ctx.layoutDef.rows;

  ctx.panes.slice(0, ctx.layoutDef.panes).forEach((pane, i) => {
    const card = pane3rdAware(ctx, i, paneCard(ctx, pane, i));
    grid.appendChild(card);
  });

  body.appendChild(grid);
  app.appendChild(body);
  app.appendChild(actionDock(ctx));
  root.appendChild(app);
}

function topBar(ctx) {
  const bar = el('div', 'c-topbar');
  bar.innerHTML = `
    <div class="c-brand">
      <div class="c-brand__logo"></div>
      SimpleExplorer
    </div>
    <div class="c-tabs">
      ${WORKSPACES.map((w, i) => `
        <button class="c-tab ${i === 0 ? 'on' : ''}">
          ${iconHTML(w.icon, 13)}
          <span>${w.name}</span>
          <small>${w.count}</small>
        </button>
      `).join('')}
      <button class="c-tab__plus">${iconHTML('plus', 13)}</button>
    </div>
    ${directionSwitcher(ctx)}
    ${layoutPicker(ctx)}
    <button class="iconbtn" data-act="theme" title="Toggle theme">${iconHTML(ctx.theme === 'dark' ? 'sun' : 'moon')}</button>
  `;
  bindClicks(bar, ctx);
  bindLayout(bar, ctx);
  return bar;
}

function sidebar(ctx) {
  const side = el('div', 'c-sidebar');
  side.appendChild(section('Pinned', [
    { icon: 'pin', label: 'Projects' },
    { icon: 'pin', label: 'qt5.14.2' },
    { icon: 'pin', label: 'Downloads' },
  ]));

  const recent = getRecent().slice(0, 5);
  if (recent.length) {
    side.appendChild(section('Recent', recent.map((p) => ({
      icon: 'clock',
      label: p.split(/[\\/]/).pop() || p,
      sub: p,
      onClick: () => ctx.onPaneNav(ctx.activePane, p),
    }))));
  }

  side.appendChild(section('Drives', [
    { icon: 'drive', label: 'C: System', meta: '146 GB' },
    { icon: 'drive', label: 'D: Data',   meta: '892 GB' },
  ]));
  return side;
}

function section(title, items) {
  const block = el('div', 'c-sec');
  const head = el('div', 'c-sec__title');
  head.textContent = title;
  block.appendChild(head);
  items.forEach((it) => {
    const row = el('div', 'c-sec__item');
    row.innerHTML = `
      ${iconHTML(it.icon, 13)}
      <div class="c-sec__lbl">
        <div>${it.label}</div>
        ${it.sub ? `<div class="c-sec__sub" title="${it.sub}">${it.sub}</div>` : ''}
      </div>
      ${it.meta ? `<small>${it.meta}</small>` : ''}
    `;
    if (it.onClick) row.addEventListener('click', it.onClick);
    block.appendChild(row);
  });
  return block;
}

function paneCard(ctx, pane, i) {
  const accent = ACCENTS[i] || ACCENTS[0];
  const card = el('div', 'c-pane' + (i === ctx.activePane ? ' c-pane--active' : ''));
  card.style.setProperty('--accent', accent);
  card.addEventListener('click', () => ctx.setActivePane(i));

  const head = el('div', 'c-pane__head');
  head.innerHTML = `
    <span class="c-pane__dot"></span>
    <span class="c-pane__lbl">${PANE_LABELS[i] || `Pane ${i + 1}`}</span>
    <span class="c-pane__sep">·</span>
    <span class="c-pane__path" title="${pane.path}">${pane.path}</span>
    <div class="spacer"></div>
    <button class="iconbtn iconbtn--sm">${iconHTML('more', 12)}</button>
  `;
  card.appendChild(head);

  const crumb = el('div', 'c-pane__crumb');
  const segs = fs.pathSegments(pane.path);
  crumb.innerHTML = `
    ${iconHTML('home', 12)}
    ${segs.map((s, idx) => `<span class="crumbs__sep">›</span><span class="${idx === segs.length - 1 ? 'crumbs__seg--last' : ''}">${s}</span>`).join('')}
    <div class="spacer"></div>
    ${iconHTML('search', 12)}
  `;
  card.appendChild(crumb);

  const cols = el('div', 'cols cols--ws');
  cols.innerHTML = '<span>Name</span><span>Size</span><span>Modified</span>';
  card.appendChild(cols);

  const rows = renderRows(pane, {
    density: 'ws',
    accent,
    onActivate: (entry) => ctx.onActivateEntry(i, entry),
  });
  card.appendChild(rows);
  return card;
}

function pane3rdAware(ctx, i, card) {
  if (ctx.layoutDef.thirdSpansFull && i === 2) {
    card.style.gridColumn = '1 / -1';
  }
  return card;
}

function actionDock(ctx) {
  const dock = el('div', 'c-dock');
  const has2 = ctx.layoutDef.panes >= 2;
  dock.innerHTML = `
    <button class="c-dock__btn" data-action="newfolder">${iconHTML('newfolder', 13)}<span>New folder</span><kbd>N</kbd></button>
    <button class="c-dock__btn" data-action="rename">${iconHTML('rename', 13)}<span>Rename</span><kbd>F2</kbd></button>
    <button class="c-dock__btn" data-action="delete">${iconHTML('trash', 13)}<span>Delete</span><kbd>Del</kbd></button>
    <span class="c-sep"></span>
    ${has2 ? `
      <button class="c-dock__btn c-dock__btn--hi" data-action="copy">${iconHTML('copy', 13)}<span>Copy → other pane</span><kbd>F5</kbd></button>
      <button class="c-dock__btn c-dock__btn--hi" data-action="compare">${iconHTML('compare', 13)}<span>Compare panes</span><kbd>Ctrl D</kbd></button>
    ` : ''}
    <div class="spacer"></div>
    <span class="c-dock__status">Workspace · Qt project · ${ctx.layoutDef.panes} pane${ctx.layoutDef.panes > 1 ? 's' : ''}</span>
  `;
  bindClicks(dock, ctx);
  return dock;
}

function layoutPicker(ctx) {
  return `<div class="c-layout">${LAYOUT_OPTS.map((o) => `
    <button data-layout="${o.id}" class="${ctx.layout === o.id ? 'on' : ''}">${iconHTML(o.icn, 13)}</button>
  `).join('')}</div>`;
}

function directionSwitcher(ctx) {
  const opts = [
    { id: 'fluent',    label: 'Fluent' },
    { id: 'cmd',       label: 'Cmd' },
    { id: 'workspace', label: 'Workspaces' },
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

function bindLayout(scope, ctx) {
  scope.querySelectorAll('[data-layout]').forEach((el) =>
    el.addEventListener('click', () => ctx.setLayout(el.dataset.layout)));
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

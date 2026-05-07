// Direction A — Fluent Refined
// Win11 evolution: Mica-style chrome, single command bar, breadcrumb path,
// drag-resizable panes in a 1/2/3/4 grid. Each pane has tabs.
// Visuals trace explorer-fluent.jsx in the design bundle.

import { iconHTML } from '../icons.js';
import { renderRows, renderColumnHeader, renderBreadcrumb, getRecent } from '../pane.js';
import { SIDEBAR_FULL } from '../sidebar-data.js';

const LAYOUT_OPTS = [
  { id: '1',  icn: 'one',       title: 'Single' },
  { id: '2v', icn: 'split-h',   title: 'Side by side' },
  { id: '2h', icn: 'split-v',   title: 'Top / bottom' },
  { id: '3',  icn: 'workspace', title: 'Three' },
  { id: '4',  icn: 'grid4',     title: 'Four' },
];

export function renderFluent(root, ctx) {
  root.innerHTML = '';
  const app = el('div', 'a-app');

  app.appendChild(titleBar(ctx));
  app.appendChild(commandBar(ctx));

  const body = el('div', 'a-body');
  body.appendChild(sidebar(ctx));

  const grid = el('div', 'a-grid');
  grid.style.gridTemplateColumns = ctx.layoutDef.cols;
  grid.style.gridTemplateRows = ctx.layoutDef.rows;

  ctx.panes.slice(0, ctx.layoutDef.panes).forEach((pane, i) => {
    const card = pane3rdAware(ctx, i, paneCard(ctx, pane, i));
    grid.appendChild(card);
  });

  body.appendChild(grid);
  app.appendChild(body);
  app.appendChild(statusBar(ctx));
  root.appendChild(app);
}

function titleBar(ctx) {
  const bar = el('div', 'a-titlebar');
  bar.innerHTML = `
    <div class="a-brand">
      <div class="a-brand__logo"></div>
      SimpleExplorer
    </div>
    <div class="spacer"></div>
    ${directionSwitcher(ctx)}
    <button class="iconbtn" data-act="theme" title="Toggle theme">
      ${iconHTML(ctx.theme === 'dark' ? 'sun' : 'moon')}
    </button>
    <div class="a-wincontrols">
      <span class="a-winctl" data-winctl="min" title="Minimize">─</span>
      <span class="a-winctl a-winctl--disabled" title="Use the OS title bar to maximize (frameless mode lands in Phase 7)">☐</span>
      <span class="a-winctl a-winctl--close" data-winctl="close" title="Close">✕</span>
    </div>
  `;
  bindClicks(bar, ctx);
  bindWinCtl(bar, ctx);
  return bar;
}

function commandBar(ctx) {
  const bar = el('div', 'a-cmdbar');
  bar.innerHTML = `
    <button class="iconbtn" data-nav="back" title="Back">${iconHTML('back')}</button>
    <button class="iconbtn" data-nav="fwd" title="Forward">${iconHTML('fwd')}</button>
    <button class="iconbtn" data-nav="up" title="Up">${iconHTML('up')}</button>
    <span class="a-sep"></span>
    <button class="cmdbtn" data-action="newfolder">${iconHTML('newfolder', 15)}<span>New</span></button>
    <button class="cmdbtn" data-action="copy">${iconHTML('copy', 15)}<span>Copy</span></button>
    <button class="cmdbtn" data-action="rename">${iconHTML('rename', 15)}<span>Rename</span></button>
    <button class="cmdbtn" data-action="delete">${iconHTML('trash', 15)}<span>Delete</span></button>
    <span class="a-sep"></span>
    <button class="cmdbtn" data-action="compare">${iconHTML('compare', 15)}<span>Compare</span></button>
    <div class="spacer"></div>
    ${layoutPicker(ctx)}
    <span class="a-sep"></span>
    <div class="a-search">
      ${iconHTML('search', 14)}
      <input data-search placeholder="Search current folder" value="${ctx.panes[ctx.activePane].filter || ''}" />
    </div>
  `;
  bindClicks(bar, ctx);
  bindNav(bar, ctx);
  bindLayout(bar, ctx);
  bindSearch(bar, ctx);
  return bar;
}

function sidebar(ctx) {
  const side = el('div', 'a-sidebar');
  SIDEBAR_FULL.forEach((sec) => {
    const block = el('div', 'a-sidebar__block');
    const title = el('div', 'a-sidebar__title');
    title.textContent = sec.section;
    block.appendChild(title);
    sec.items.forEach((it) => {
      const row = el('div', 'a-sidebar__item');
      row.innerHTML = `${iconHTML(it.icon, 15)}<span>${it.name}</span>${it.meta ? `<small>${it.meta}</small>` : ''}`;
      const target = it.path || (it.key ? ctx.railTarget(it.key) : null);
      if (target) row.addEventListener('click', () => ctx.onPaneNav(ctx.activePane, target));
      block.appendChild(row);
    });
    side.appendChild(block);
  });

  if (ctx.drives.length) {
    const block = el('div', 'a-sidebar__block');
    block.innerHTML = `<div class="a-sidebar__title">Drives</div>`;
    ctx.drives.forEach((d) => {
      const row = el('div', 'a-sidebar__item');
      const meta = d.free_bytes ? `${freeLabelGB(d.free_bytes)} free` : '';
      row.innerHTML = `${iconHTML('drive', 15)}<span>${d.name}</span>${meta ? `<small>${meta}</small>` : ''}`;
      row.addEventListener('click', () => ctx.onPaneNav(ctx.activePane, d.path));
      block.appendChild(row);
    });
    side.appendChild(block);
  }

  const recent = getRecent();
  if (recent.length) {
    const block = el('div', 'a-sidebar__block');
    block.innerHTML = `<div class="a-sidebar__title">Recent</div>`;
    recent.slice(0, 5).forEach((p) => {
      const row = el('div', 'a-sidebar__item');
      row.innerHTML = `${iconHTML('clock', 15)}<span title="${p}">${shortPath(p)}</span>`;
      row.addEventListener('click', () => ctx.onPaneNav(ctx.activePane, p));
      block.appendChild(row);
    });
    side.appendChild(block);
  }
  return side;
}

function paneCard(ctx, pane, i) {
  const card = el('div', 'a-pane' + (i === ctx.activePane ? ' a-pane--active' : ''));
  card.addEventListener('click', () => ctx.setActivePane(i));

  const tabbar = el('div', 'a-tabs');
  const tab = el('div', 'a-tab a-tab--active');
  tab.innerHTML = `${iconHTML('folder', 13)}<span>${shortPath(pane.path).split(/[\\/]/).pop() || 'home'}</span>${iconHTML('close', 11)}`;
  tabbar.appendChild(tab);
  const plus = el('button', 'a-tab__plus');
  plus.innerHTML = iconHTML('plus', 12);
  tabbar.appendChild(plus);
  card.appendChild(tabbar);

  const crumbBar = el('div', 'a-crumbbar');
  crumbBar.appendChild(renderBreadcrumb(pane.path, (p) => ctx.onPaneNav(i, p)));
  card.appendChild(crumbBar);

  const head = renderColumnHeader('a');
  card.appendChild(head);

  const rows = renderRows(pane, {
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

function statusBar(ctx) {
  const pane = ctx.panes[ctx.activePane];
  const bar = el('div', 'a-statusbar');
  bar.innerHTML = `
    <span>Pane ${ctx.activePane + 1} · ${pane.entries.length} items · ${pane.selected.size} selected</span>
    <div class="spacer"></div>
    <span>${pane.path}</span>
  `;
  return bar;
}

function layoutPicker(ctx) {
  return `<div class="a-layout">${LAYOUT_OPTS.map((o) => `
    <button data-layout="${o.id}" title="${o.title}" class="${ctx.layout === o.id ? 'on' : ''}">${iconHTML(o.icn, 14)}</button>
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

function bindWinCtl(scope, ctx) {
  scope.querySelectorAll('[data-winctl]').forEach((el) =>
    el.addEventListener('click', (e) => { e.stopPropagation(); ctx.onWinCtl(el.dataset.winctl); }));
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

function bindSearch(scope, ctx) {
  const input = scope.querySelector('[data-search]');
  if (!input) return;
  input.addEventListener('input', () => ctx.onFilter(ctx.activePane, input.value));
}

function freeLabelGB(bytes) {
  const gb = bytes / 1073741824;
  return gb >= 100 ? Math.round(gb) + ' GB' : gb.toFixed(1) + ' GB';
}

function shortPath(p) {
  if (!p) return '';
  if (p.length < 32) return p;
  return '…' + p.slice(-30);
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

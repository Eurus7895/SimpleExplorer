// Top-level app. Owns the active direction, theme/layout per direction, and
// the array of pane states. Each direction module exports a render(root, ctx)
// that paints the chrome around the panes.

import * as fs from './fs.js';
import { createPaneState, navigate, goBack, goForward, goUp, loadPath, tabNew, tabClose, tabSwitch, tabSnapshot } from './pane.js';
import { renderFluent, statusBar as fluentStatusBar } from './directions/fluent.js';
import { renderCmd } from './directions/cmd.js';
import { LAYOUT_DEFS, DEFAULT_SPLITS } from './layout.js';
import { openPalette, isPaletteOpen } from './palette.js';

// Boot the Neutralino client. Safe to call before DOM ready; APIs queue until
// the runtime handshake completes. No-op when running directly in a browser
// (mock mode), where window.Neutralino is undefined.
if (window.Neutralino) {
  try {
    window.Neutralino.init();
    window.Neutralino.events.on('windowClose', () => window.Neutralino.app.exit());
  } catch (e) {
    console.warn('Neutralino.init failed:', e);
  }
}

const STATE_KEY = 'simple-explorer.state';
const TABS_KEY = 'simple-explorer.tabs';
const DEFAULT = {
  direction: 'fluent',
  themeA: 'light', layoutA: '2v',
  themeB: 'light', layoutB: '2v',
  splits: { ...DEFAULT_SPLITS },
  cmdRailOpen: 'recent',
};

const RENDERERS = {
  fluent: { fn: renderFluent, themeKey: 'themeA', layoutKey: 'layoutA' },
  cmd:    { fn: renderCmd,    themeKey: 'themeB', layoutKey: 'layoutB' },
};

const settings = loadSettings();
let panes = [];
let activePane = 0;
let homePath = '~';
let drives = [];

// Stable adapter for the palette so the global Ctrl+K handler doesn't
// have to chase the per-render ctx. Getters resolve at call time so
// `panes` / `activePane` reassignment doesn't strand the palette.
const paletteCtx = {
  get activePane() { return activePane; },
  get panes() { return panes; },
  onPaneNav: async (i, path) => { await navigate(panes[i], path); saveTabs(); render(); },
  onActivateEntry: (i, entry) => handleActivate(i, entry),
};

async function init() {
  homePath = (await fs.homeDir()) || '~';
  const seedPaths = [
    homePath,
    homePath,
    quickAccessPath('Downloads'),
    quickAccessPath('Documents'),
  ];
  const saved = loadTabs();
  panes = seedPaths.map((p, i) => {
    const persisted = saved && saved[i];
    return createPaneState(
      i, p,
      persisted ? persisted.tabs : null,
      persisted ? persisted.activeTabIdx : 0,
    );
  });
  await Promise.all(panes.map((p) => safeLoad(p)));
  render();
  bindGlobalKeys();
  // Drives populate after first paint so list/render isn't blocked on a
  // helper / PowerShell shell-out at startup.
  fs.listDrives().then((d) => { drives = d; render(); }).catch(() => {});
}

function quickAccessPath(name) {
  const sep = homePath.includes('\\') ? '\\' : '/';
  return homePath + sep + name;
}

function railTarget(key) {
  switch (key) {
    case 'home':      return homePath;
    case 'downloads': return quickAccessPath('Downloads');
    case 'documents': return quickAccessPath('Documents');
    case 'pictures':  return quickAccessPath('Pictures');
    case 'desktop':   return quickAccessPath('Desktop');
    default: return null; // pinned/recent/drives → popovers (out of scope)
  }
}

async function safeLoad(state) {
  try {
    await loadPath(state, state.path);
  } catch {
    state.entries = [];
  }
}

// Cheap active-pane swap: toggles classes on existing pane cards and
// rebuilds Fluent's global status bar in place. No full render() — keeps
// row DOM stable so cross-pane click + dblclick work in one gesture.
function applyActivePane(i) {
  if (i < 0 || i >= panes.length) return;
  activePane = i;
  document.querySelectorAll('[data-pane-idx]').forEach((card) => {
    const isActive = Number(card.dataset.paneIdx) === i;
    if (card.classList.contains('a-pane')) card.classList.toggle('a-pane--active', isActive);
    if (card.classList.contains('b-pane')) card.classList.toggle('b-pane--active', isActive);
  });
  const oldBar = document.querySelector('.a-statusbar');
  if (oldBar) oldBar.replaceWith(fluentStatusBar({ panes, activePane }));
}

function render() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  const dir = RENDERERS[settings.direction];
  const layoutId = settings[dir.layoutKey];
  const ctx = {
    direction: settings.direction,
    theme: settings[dir.themeKey],
    layout: layoutId,
    layoutDef: LAYOUT_DEFS[layoutId] || LAYOUT_DEFS['2v'],
    splits: settings.splits[layoutId] || { ...(DEFAULT_SPLITS[layoutId] || {}) },
    panes,
    get activePane() { return activePane; },
    home: homePath,
    drives,
    quickAccessPath,
    railTarget,
    onSplitChange(next) {
      settings.splits[layoutId] = next;
      saveSettings();
      render();
    },
    async onWinCtl(kind) {
      const N = window.Neutralino; if (!N) return;
      // Each call wrapped individually — Neutralino 5.6.0 with the default
      // (non-frameless) window mode can race with the OS title bar and
      // leave the window in a degenerate state if these throw mid-toggle.
      // The OS title bar still has its own ☐ / ─ / ✕, so on failure the
      // user can recover from there.
      if (kind === 'min') {
        try { await N.window.minimize(); }
        catch (e) { console.warn('window.minimize failed:', e); }
      } else if (kind === 'max') {
        // Always maximize — let the OS title bar handle un-maximize.
        // The previous isMaximized() / unmaximize() toggle could send the
        // window off-screen on multi-monitor / HiDPI setups.
        try {
          await N.window.maximize();
          await N.window.show(); // safety net in case maximize hid us
        } catch (e) { console.warn('window.maximize failed:', e); }
      } else if (kind === 'close') {
        try { await N.app.exit(); }
        catch (e) { console.warn('app.exit failed:', e); }
      }
    },
    setActivePane(i) { applyActivePane(i); },
    setDirection(d) { settings.direction = d; saveSettings(); render(); },
    setTheme(t) { settings[dir.themeKey] = t; saveSettings(); render(); },
    setLayout(l) { settings[dir.layoutKey] = l; saveSettings(); render(); },
    onActivateEntry: handleActivate,
    onPaneNav: async (i, path) => { await navigate(panes[i], path); saveTabs(); render(); },
    onPaneBack: async (i) => { await goBack(panes[i]); saveTabs(); render(); },
    onPaneForward: async (i) => { await goForward(panes[i]); saveTabs(); render(); },
    onPaneUp: async (i) => { await goUp(panes[i]); saveTabs(); render(); },
    onFilter: (i, q) => { panes[i].filter = q; render(); },
    onTabNew: async (i) => { await tabNew(panes[i], panes[i].path); saveTabs(); render(); },
    onTabClose: async (i, tabIdx) => { if (await tabClose(panes[i], tabIdx)) { saveTabs(); render(); } },
    onTabSwitch: async (i, tabIdx) => { await tabSwitch(panes[i], tabIdx); saveTabs(); render(); },
    onSortChange: (i, sort) => { panes[i].sort = sort; saveTabs(); render(); },
    onViewChange: (i, view) => { panes[i].view = view; saveTabs(); render(); },
    cmdRailOpen: settings.cmdRailOpen ?? null,
    onCmdRailToggle: (id) => { settings.cmdRailOpen = id; saveSettings(); render(); },
    onRename: async (i, oldName, newName) => {
      const p = panes[i];
      p.renaming = null;
      if (newName && newName !== oldName) {
        try {
          await fs.rename(fs.joinPath(p.path, oldName), fs.joinPath(p.path, newName));
        } catch (e) { console.warn('rename failed:', e); }
        await safeLoad(p);
      }
      render();
    },
    onAction: (action) => doAction(action),
    onDrop: async (srcIdx, dstIdx, names, op) => {
      if (srcIdx === dstIdx || !names?.length) return;
      const src = panes[srcIdx];
      const dst = panes[dstIdx];
      const fn = op === 'copy' ? fs.copy : fs.move;
      for (const name of names) {
        try { await fn(fs.joinPath(src.path, name), fs.joinPath(dst.path, name)); }
        catch (e) { console.warn(`${op} failed for ${name}:`, e); }
      }
      await Promise.all([safeLoad(src), safeLoad(dst)]);
      activePane = dstIdx;
      saveTabs();
      render();
    },
    rerender: render,
  };
  document.documentElement.dataset.theme = ctx.theme;
  document.documentElement.dataset.direction = ctx.direction;
  dir.fn(root, ctx);
}

async function handleActivate(paneIdx, entry) {
  if (entry.is_dir) {
    await navigate(panes[paneIdx], entry.path);
    render();
  } else {
    await fs.openInOS(entry.path);
  }
}

async function doAction(action) {
  const pane = panes[activePane];
  switch (action) {
    case 'newfolder': {
      const name = prompt('New folder name:');
      if (!name) return;
      await fs.makeDir(fs.joinPath(pane.path, name));
      await safeLoad(pane);
      render();
      break;
    }
    case 'rename': {
      const sel = [...pane.selected][0];
      if (!sel) return;
      // Trigger inline edit on the row; the actual fs.rename happens via
      // ctx.onRename callback wired into renderRows below.
      pane.renaming = sel;
      render();
      break;
    }
    case 'delete': {
      if (!pane.selected.size) return;
      if (!confirm(`Move ${pane.selected.size} item(s) to Recycle Bin?`)) return;
      for (const name of pane.selected) {
        await fs.deleteToTrash(fs.joinPath(pane.path, name));
      }
      await safeLoad(pane);
      render();
      break;
    }
    case 'copy':
    case 'move': {
      if (panes.length < 2 || !pane.selected.size) return;
      const dest = panes[(activePane + 1) % panes.length];
      const op = action === 'copy' ? fs.copy : fs.move;
      for (const name of pane.selected) {
        await op(fs.joinPath(pane.path, name), fs.joinPath(dest.path, name));
      }
      await safeLoad(pane);
      await safeLoad(dest);
      render();
      break;
    }
    case 'reveal': {
      const sel = [...pane.selected][0];
      if (sel) await fs.revealInOS(fs.joinPath(pane.path, sel));
      else await fs.openInOS(pane.path);
      break;
    }
    case 'refresh': {
      await safeLoad(pane);
      render();
      break;
    }
    case 'openSelected': {
      const sel = [...pane.selected][0];
      if (!sel) return;
      const entry = pane.entries.find((e) => e.name === sel);
      if (!entry) return;
      await handleActivate(activePane, entry);
      break;
    }
    case 'properties': {
      const sel = [...pane.selected][0];
      const target = sel ? fs.joinPath(pane.path, sel) : pane.path;
      await fs.showProperties(target);
      break;
    }
    case 'vscode': {
      const sel = [...pane.selected][0];
      const target = sel ? fs.joinPath(pane.path, sel) : pane.path;
      await fs.openInVSCode(target);
      break;
    }
    case 'terminal': {
      await fs.openInTerminal(pane.path);
      break;
    }
    case 'copyPath': {
      const sel = [...pane.selected][0];
      const target = sel ? fs.joinPath(pane.path, sel) : pane.path;
      await fs.copyPath(target);
      break;
    }
    case 'deletePerm': {
      if (!pane.selected.size) return;
      if (!confirm(`Permanently delete ${pane.selected.size} item(s)? This cannot be undone.`)) return;
      for (const name of pane.selected) {
        await fs.deletePermanent(fs.joinPath(pane.path, name));
      }
      await safeLoad(pane);
      render();
      break;
    }
    case 'compare': {
      // Simple compare: highlight rows in active pane that aren't in next pane
      // by name (purely visual; no rename/move suggestions in v1).
      if (panes.length < 2) return;
      const dest = panes[(activePane + 1) % panes.length];
      const otherNames = new Set(dest.entries.map((e) => e.name));
      const compareTag = '__compare_unique';
      pane.entries.forEach((e) => { e[compareTag] = !otherNames.has(e.name); });
      pane.selected.clear();
      pane.entries.filter((e) => e[compareTag]).forEach((e) => pane.selected.add(e.name));
      render();
      break;
    }
    case 'theme': {
      const dir = RENDERERS[settings.direction];
      settings[dir.themeKey] = settings[dir.themeKey] === 'dark' ? 'light' : 'dark';
      saveSettings();
      render();
      break;
    }
    case 'tabNew': {
      await tabNew(pane, pane.path);
      saveTabs();
      render();
      break;
    }
    case 'tabClose': {
      if (await tabClose(pane, pane.activeTabIdx)) {
        saveTabs();
        render();
      }
      break;
    }
  }
}

function bindGlobalKeys() {
  document.addEventListener('explorer:action', (e) => doAction(e.detail));
  document.addEventListener('keydown', (e) => {
    // Both directions now anchor the palette to a visible input
    // (`.palette-input`) embedded in their chrome. Ctrl+K focuses it;
    // Ctrl+L focuses it pre-filled with the active pane's path. The
    // standalone overlay path is kept as a fallback for environments
    // where the input isn't in the DOM.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      const input = document.querySelector('input.palette-input');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (!isPaletteOpen()) {
        e.preventDefault();
        openPalette({ ctx: paletteCtx, getPane: () => panes[activePane] });
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
      const pane = panes[activePane];
      if (!pane) return;
      e.preventDefault();
      const input = document.querySelector('input.palette-input');
      if (input) {
        input.focus();
        input.value = pane.path;
        input.setSelectionRange(pane.path.length, pane.path.length);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        openPalette({
          ctx: paletteCtx,
          getPane: () => panes[activePane],
          initialQuery: pane.path,
        });
      }
      return;
    }
    const tgt = e.target;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    if (e.key === 'F2') doAction('rename');
    else if (e.key === 'F5') doAction('copy');
    else if (e.key === 'F6') doAction('move');
    else if (e.key === 'Delete') doAction(e.shiftKey ? 'deletePerm' : 'delete');
    else if (e.key === 'Backspace') { goUp(panes[activePane]).then(render); }
    else if (e.altKey && e.key === 'ArrowLeft') { goBack(panes[activePane]).then(render); }
    else if (e.altKey && e.key === 'ArrowRight') { goForward(panes[activePane]).then(render); }
    else if (e.key === 'Escape') {
      typeBuf = '';
      clearTimeout(typeBufTimer);
      const pane = panes[activePane];
      if (pane?.selected.size) { pane.selected.clear(); render(); }
    }
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Type-to-jump (Windows Explorer style): printable keys accumulate
      // into a prefix buffer for 750 ms; the active pane jumps to the
      // first row whose name starts with the buffer. Doesn't filter the
      // list — selection moves only.
      const ch = e.key.toLowerCase();
      if (!/[a-z0-9._\-+ ]/.test(ch)) return;
      typeBuf += ch;
      clearTimeout(typeBufTimer);
      typeBufTimer = setTimeout(() => { typeBuf = ''; }, 750);
      typeJump(typeBuf);
    }
  });
}

let typeBuf = '';
let typeBufTimer = null;

function typeJump(prefix) {
  const pane = panes[activePane];
  if (!pane || !pane.entries.length) return;
  const found = pane.entries.find((it) => it.name.toLowerCase().startsWith(prefix));
  if (!found) return;
  pane.selected.clear();
  pane.selected.add(found.name);
  render();
  // After re-render, find the matching row in the active pane and scroll
  // it into view. CSS.escape handles names with quotes / backslashes.
  const sel = `.row[data-name="${CSS.escape(found.name)}"]`;
  const row = document.querySelector(`.a-pane--active ${sel}, .b-pane--active ${sel}`);
  row?.scrollIntoView({ block: 'nearest' });
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    const merged = { ...DEFAULT, ...raw, splits: { ...DEFAULT_SPLITS, ...(raw.splits || {}) } };
    // Migrate users who had the now-removed Workspace direction selected.
    if (!RENDERERS[merged.direction]) merged.direction = 'fluent';
    return merged;
  } catch {
    return { ...DEFAULT, splits: { ...DEFAULT_SPLITS } };
  }
}

function saveSettings() {
  localStorage.setItem(STATE_KEY, JSON.stringify(settings));
}

function loadTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || 'null');
    if (!Array.isArray(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveTabs() {
  try {
    const payload = panes.map((p) => ({
      tabs: tabSnapshot(p),
      activeTabIdx: p.activeTabIdx,
    }));
    localStorage.setItem(TABS_KEY, JSON.stringify(payload));
  } catch {}
}

init();

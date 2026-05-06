// Top-level app. Owns the active direction, theme/layout per direction, and
// the array of pane states. Each direction module exports a render(root, ctx)
// that paints the chrome around the panes.

import * as fs from './fs.js';
import { createPaneState, navigate, goBack, goForward, goUp } from './pane.js';
import { renderFluent } from './directions/fluent.js';
import { renderCmd } from './directions/cmd.js';
import { renderWorkspace } from './directions/workspace.js';

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
const DEFAULT = {
  direction: 'fluent',
  themeA: 'light', layoutA: '2v',
  themeB: 'light', layoutB: '2v',
  themeC: 'dark',  layoutC: '3',
};

const RENDERERS = {
  fluent:    { fn: renderFluent,    themeKey: 'themeA', layoutKey: 'layoutA' },
  cmd:       { fn: renderCmd,       themeKey: 'themeB', layoutKey: 'layoutB' },
  workspace: { fn: renderWorkspace, themeKey: 'themeC', layoutKey: 'layoutC' },
};

const LAYOUTS = {
  '1':  { panes: 1, cols: '1fr',     rows: '1fr',     thirdSpansFull: false },
  '2v': { panes: 2, cols: '1fr 1fr', rows: '1fr',     thirdSpansFull: false },
  '2h': { panes: 2, cols: '1fr',     rows: '1fr 1fr', thirdSpansFull: false },
  '3':  { panes: 3, cols: '1fr 1fr', rows: '1fr 1fr', thirdSpansFull: true  },
  '4':  { panes: 4, cols: '1fr 1fr', rows: '1fr 1fr', thirdSpansFull: false },
};

const settings = loadSettings();
let panes = [];
let activePane = 0;

async function init() {
  const home = (await fs.homeDir()) || '~';
  const seedPaths = [
    home,
    home,
    home + (home.includes('\\') ? '\\Downloads' : '/Downloads'),
    home + (home.includes('\\') ? '\\Documents' : '/Documents'),
  ];
  panes = seedPaths.map((p, i) => createPaneState(i, p));
  await Promise.all(panes.map((p) => safeLoad(p)));
  render();
  bindGlobalKeys();
}

async function safeLoad(state) {
  try {
    state.entries = await fs.listDir(state.path);
  } catch {
    state.entries = [];
  }
}

function render() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  const dir = RENDERERS[settings.direction];
  const ctx = {
    direction: settings.direction,
    theme: settings[dir.themeKey],
    layout: settings[dir.layoutKey],
    layoutDef: LAYOUTS[settings[dir.layoutKey]] || LAYOUTS['2v'],
    panes,
    activePane,
    setActivePane(i) {
      // No-op when already active — re-rendering on every row click was
      // tearing down the row mid-double-click, so the dblclick event lost
      // its target and "open folder" silently failed.
      if (i === activePane) return;
      activePane = i;
      render();
    },
    setDirection(d) { settings.direction = d; saveSettings(); render(); },
    setTheme(t) { settings[dir.themeKey] = t; saveSettings(); render(); },
    setLayout(l) { settings[dir.layoutKey] = l; saveSettings(); render(); },
    onActivateEntry: handleActivate,
    onPaneNav: async (i, path) => { await navigate(panes[i], path); render(); },
    onPaneBack: async (i) => { await goBack(panes[i]); render(); },
    onPaneForward: async (i) => { await goForward(panes[i]); render(); },
    onPaneUp: async (i) => { await goUp(panes[i]); render(); },
    onFilter: (i, q) => { panes[i].filter = q; render(); },
    onAction: (action) => doAction(action),
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
      const next = prompt('Rename to:', sel);
      if (!next || next === sel) return;
      await fs.rename(fs.joinPath(pane.path, sel), fs.joinPath(pane.path, next));
      await safeLoad(pane);
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
  }
}

function bindGlobalKeys() {
  document.addEventListener('explorer:action', (e) => doAction(e.detail));
  document.addEventListener('keydown', (e) => {
    const tgt = e.target;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    if (e.key === 'F2') doAction('rename');
    else if (e.key === 'F5') doAction('copy');
    else if (e.key === 'F6') doAction('move');
    else if (e.key === 'Delete') doAction(e.shiftKey ? 'deletePerm' : 'delete');
    else if (e.key === 'Backspace') { goUp(panes[activePane]).then(render); }
    else if (e.altKey && e.key === 'ArrowLeft') { goBack(panes[activePane]).then(render); }
    else if (e.altKey && e.key === 'ArrowRight') { goForward(panes[activePane]).then(render); }
  });
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return { ...DEFAULT, ...raw };
  } catch {
    return { ...DEFAULT };
  }
}

function saveSettings() {
  localStorage.setItem(STATE_KEY, JSON.stringify(settings));
}

init();

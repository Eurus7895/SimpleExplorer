// Integrated terminal for the Cmd direction.
//
// Phase 8b rewrite: xterm.js renderer over a ConPTY-backed helper. Replaces
// the v1 line-oriented `<pre>` + input pair that couldn't host vim, less,
// top, password prompts, or tab completion. All of those now work because
// the shell sees a real Windows pseudo-console (CreatePseudoConsole, Win10
// 1809+) via tools/shellhelp.cpp's `pty` verb.
//
// Wire diagram:
//
//   xterm.js Terminal  ←──────  helper stdout  ←──────  PTY output  ←─ shell
//        │ onData(d)
//        ▼
//   helper stdin  ──▶  PTY input  ──▶  shell reads keystrokes
//
// Resize is an out-of-band control sequence on stdin:
//   ESC ] SE_CTL ; resize ; <cols> ; <rows> BEL
// The helper intercepts and calls ResizePseudoConsole; everything else
// passes through as raw PTY input. Format kept in sync with
// PTY_CTL_PREFIX in tools/shellhelp.cpp.
//
// Helper missing? We don't fall back to a half-broken line-oriented stub
// (that was the trap Phase 7g shipped). The panel shows a one-paragraph
// "build the helper or grab the CI artifact" message and stays out of
// the way until the user fixes the install.

import { iconHTML } from './icons.js';
import * as fs from './fs.js';

const SHELL_KEY = 'simple-explorer.terminal.shell';
const TOGGLE_KEY = 'simple-explorer.terminal.open';

const PTY_CTL_PREFIX = '\x1b]SE_CTL;';
const PTY_CTL_TERM = '\x07';
const HELPER_PATH = 'extras\\shellhelp.exe';

// Neutralino 5.x server base64-decodes the `data` argument of
// `os.updateSpawnedProcess(id, 'stdIn', ...)` before writing to the
// child's stdin pipe. Passing raw bytes silently drops the payload
// (the call still resolves with success:true). Encode UTF-8 → bytes
// → binary string → base64 so non-ASCII keystrokes round-trip too.
function b64utf8(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Per-tab runtime state. Tabs are
//   { id, shell, cwd, term, fit, proc, handlerOff, missing? }
// `focusOnRender` is a one-shot flag honored once and cleared. Set when
// the user explicitly opens the panel or creates a new terminal — never
// on incidental re-renders driven by pane navigation.
const state = {
  open: load(TOGGLE_KEY) === 'true',
  tabs: [],
  active: 0,
  focusOnRender: false,
};

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }

export function isTerminalOpen() { return state.open; }
export function setTerminalOpen(open) {
  state.open = !!open;
  save(TOGGLE_KEY, state.open ? 'true' : 'false');
}
export function toggleTerminal() {
  const wasOpen = state.open;
  setTerminalOpen(!state.open);
  if (!wasOpen && state.open) state.focusOnRender = true;
  return state.open;
}

// Detect available shells in PATH, in VS Code's preference order. Cached
// per-machine on first detection.
async function detectShell() {
  const cached = load(SHELL_KEY);
  if (cached) return cached;
  const N = window.Neutralino;
  if (!N) return 'cmd.exe';
  const env = await N.os.getEnvs?.().catch?.(() => null);
  const path = (env?.PATH || env?.Path || '').toLowerCase();
  let pick = 'cmd.exe';
  if (path.includes('powershell\\7')) pick = 'pwsh.exe';
  else if (path.includes('git\\bin')) pick = 'bash.exe';
  save(SHELL_KEY, pick);
  return pick;
}

function makeXterm() {
  const T = window.Terminal;
  if (!T) return null;
  const Fit = window.FitAddon?.FitAddon;
  const Links = window.WebLinksAddon?.WebLinksAddon;
  const term = new T({
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    convertEol: false,
    theme: { background: '#0c0c0c', foreground: '#cccccc' },
  });
  const fit = Fit ? new Fit() : null;
  if (fit) term.loadAddon(fit);
  if (Links) term.loadAddon(new Links());
  return { term, fit };
}

export async function newTerminal(cwd) {
  const N = window.Neutralino;
  if (!N) return null;

  const ok = await fs.helperAvailable();
  if (!ok) {
    const tab = { id: Date.now() + Math.random(), missing: true, shell: '', cwd: cwd || '' };
    state.tabs.push(tab);
    state.active = state.tabs.length - 1;
    state.focusOnRender = true;
    return tab;
  }

  const shell = await detectShell();
  const made = makeXterm();
  if (!made) {
    console.warn('terminal: xterm.js not loaded');
    return null;
  }

  const tab = {
    id: Date.now() + Math.random(),
    shell, cwd: cwd || '',
    term: made.term, fit: made.fit,
    proc: null, handlerOff: null,
  };

  // Build the helper command line. Quote each arg so paths with spaces
  // round-trip. Neutralino's spawnProcess takes a single string; the
  // OS's CommandLineToArgvW handles the de-quoting on the helper side.
  const argv = [HELPER_PATH, 'pty', shell];
  if (tab.cwd) argv.push(tab.cwd);
  const cmd = argv.map((a) => `"${a}"`).join(' ');

  try {
    const proc = await N.os.spawnProcess(cmd);
    tab.proc = proc;

    tab.handlerOff = N.events.on('spawnedProcess', (e) => {
      if (e.detail?.id !== proc.id) return;
      const { action, data } = e.detail;
      console.debug('[term] proc evt', action, typeof data === 'string' ? data.length : data);
      if (action === 'stdOut' || action === 'stdErr') {
        // xterm.js parses ANSI + escape sequences itself.
        if (typeof data === 'string') tab.term.write(data);
      } else if (action === 'exit') {
        tab.term.write(`\r\n[helper exited ${data}]\r\n`);
        tab.proc = null;
      }
    });

    // PTY input: forward every keystroke / paste chunk to the helper.
    // Logs land in DevTools console (Ctrl+Shift+I in the Neutralino
    // window) so the chain xterm → JS → helper can be diagnosed when
    // a key seems to "go nowhere".
    tab.term.onData((d) => {
      console.debug('[term] onData', JSON.stringify(d), 'proc=', tab.proc?.id);
      if (!tab.proc) return;
      try {
        const r = N.os.updateSpawnedProcess(tab.proc.id, 'stdIn', b64utf8(d));
        if (r && typeof r.then === 'function') {
          r.catch((err) => console.warn('[term] stdIn failed:', err));
        }
      } catch (e) {
        console.warn('[term] stdIn threw:', e);
      }
    });
    console.debug('[term] new helper proc id=', proc.id, 'shell=', shell, 'cwd=', tab.cwd);
  } catch (e) {
    tab.term.write(`[failed to spawn helper: ${e?.message || e}]\r\n`);
  }

  state.tabs.push(tab);
  state.active = state.tabs.length - 1;
  state.focusOnRender = true;
  return tab;
}

export async function closeTerminal(idx) {
  const tab = state.tabs[idx];
  if (!tab) return;
  if (tab.handlerOff) { try { tab.handlerOff(); } catch {} }
  if (tab.proc) {
    try { await window.Neutralino.os.updateSpawnedProcess(tab.proc.id, 'exit'); }
    catch {}
  }
  if (tab.term) { try { tab.term.dispose(); } catch {} }
  state.tabs.splice(idx, 1);
  if (state.active >= state.tabs.length) {
    state.active = Math.max(0, state.tabs.length - 1);
  }
}

export async function switchTerminal(idx) {
  if (idx < 0 || idx >= state.tabs.length) return;
  state.active = idx;
}

function sendResize(tab) {
  if (!tab?.proc || !tab.term) return;
  const cols = tab.term.cols, rows = tab.term.rows;
  if (!cols || !rows) return;
  const msg = `${PTY_CTL_PREFIX}resize;${cols};${rows}${PTY_CTL_TERM}`;
  try { window.Neutralino.os.updateSpawnedProcess(tab.proc.id, 'stdIn', b64utf8(msg)); }
  catch {}
}

export function renderTerminal(container, { onClose, onNewTab, panePath }) {
  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'term';
  container.appendChild(panel);

  // Hoisted before the early-return paths so `rerender()` can safely
  // call `ro?.disconnect()` even when those paths never reach the
  // ResizeObserver setup below. Previously the TDZ on `const ro`
  // turned every empty-state click into a silent ReferenceError;
  // tabs were created in `state` but the panel never repainted, so
  // switching directions was the only way to see them.
  let raf = 0;
  let ro = null;

  function rerender() {
    if (ro) ro.disconnect();
    renderTerminal(container, { onClose, onNewTab, panePath });
  }

  const head = document.createElement('div');
  head.className = 'term__head';
  head.innerHTML = `
    <div class="term__tabs"></div>
    <button class="term__btn" data-act="new" title="New terminal">${iconHTML('plus', 12)}</button>
    <div class="spacer"></div>
    <button class="term__btn" data-act="close" title="Close terminal">${iconHTML('close', 12)}</button>
  `;
  panel.appendChild(head);

  const tabsBar = head.querySelector('.term__tabs');
  state.tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'term__tab' + (i === state.active ? ' term__tab--on' : '');
    const label = t.missing ? 'helper missing' : (t.shell || '').replace(/\.exe$/i, '');
    btn.textContent = `${i + 1}: ${label}`;
    btn.addEventListener('click', () => { switchTerminal(i); rerender(); });
    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return;
      e.preventDefault(); e.stopPropagation();
      closeTerminal(i).then(rerender);
    });
    const x = document.createElement('span');
    x.className = 'term__tab-close';
    x.textContent = '×';
    x.addEventListener('click', (e) => { e.stopPropagation(); closeTerminal(i).then(rerender); });
    btn.appendChild(x);
    tabsBar.appendChild(btn);
  });

  head.querySelector('[data-act="new"]').addEventListener('click', async () => {
    await newTerminal(panePath);
    rerender();
  });
  head.querySelector('[data-act="close"]').addEventListener('click', () => onClose?.());

  const body = document.createElement('div');
  body.className = 'term__body';
  panel.appendChild(body);

  const active = state.tabs[state.active];
  if (!active) {
    const empty = document.createElement('div');
    empty.className = 'term__empty';
    empty.innerHTML = `<button class="term__start" data-act="start">${iconHTML('terminal', 14)} Start a new terminal</button>`;
    empty.querySelector('[data-act="start"]').addEventListener('click', async () => {
      await newTerminal(panePath);
      rerender();
    });
    body.appendChild(empty);
    return () => {};
  }

  if (active.missing) {
    const msg = document.createElement('div');
    msg.className = 'term__missing';
    msg.innerHTML = `
      <p><strong>Native helper required.</strong></p>
      <p>The integrated terminal needs <code>extras\\shellhelp.exe</code>. Build it locally with MSVC (<code>tools/build.md</code>) or download the artifact from the <em>Build shellhelp.exe</em> CI workflow.</p>
    `;
    body.appendChild(msg);
    return () => {};
  }

  const mount = document.createElement('div');
  mount.className = 'term__xterm';
  mount.dataset.termOut = String(active.id);
  body.appendChild(mount);

  // Mount the existing Terminal into the new DOM node. Switching tabs
  // re-mounts; xterm preserves scrollback across .open() calls on the
  // same Terminal instance.
  active.term.open(mount);

  // Defer fit + focus to the next frame so layout has settled. Calling
  // fit() while mount.clientWidth/Height are still 0 produces a 0-col
  // terminal that visibly renders the prompt (xterm draws what it has)
  // but silently rejects input. Waiting one frame lets the flexbox /
  // grid finalize the panel size first.
  requestAnimationFrame(() => {
    if (active.fit) {
      try { active.fit.fit(); } catch {}
      sendResize(active);
    }
    try { active.term.focus(); } catch {}
    console.debug('[term] post-fit focus; cols=', active.term.cols, 'rows=', active.term.rows);
  });

  // Click anywhere in the wrapper or its descendants focuses the
  // hidden xterm textarea. Bound to mount with capture: true so we
  // run before any internal handlers that might consume the event,
  // and on the .terminal element xterm renders inside mount so even
  // padding-band clicks work.
  const focusXterm = () => {
    try { active.term.focus(); } catch {}
  };
  mount.addEventListener('mousedown', focusXterm, true);

  // ResizeObserver: refit + re-send resize whenever the panel changes
  // size. rAF coalesces splitter-drag floods so the helper isn't spammed
  // with control messages on every pixel of motion.
  ro = new ResizeObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!active.fit) return;
      try { active.fit.fit(); } catch {}
      sendResize(active);
    });
  });
  ro.observe(mount);

  state.focusOnRender = false;

  return () => { if (ro) ro.disconnect(); };
}

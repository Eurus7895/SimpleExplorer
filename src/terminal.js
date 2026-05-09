// Integrated terminal for the Cmd direction.
//
// v1 is intentionally line-oriented: spawns the user's shell via
// Neutralino.os.spawnProcess (no PTY) and pipes stdout/stderr into a
// scrolling <pre>. Stdin comes from a single text input at the bottom;
// Enter ships the line to the process via os.updateSpawnedProcess.
//
// Trade-offs documented in docs/roadmap.md Phase 7g:
//   ✓ works for `dir`, `git status`, `npm run` and other line-oriented
//     commands (the 90% case for an explorer-side terminal).
//   ✗ TUI apps (vim, less, top) misbehave because there's no PTY -- no
//     resize signal, no escape-sequence translation, line-buffered I/O.
//   The promised ConPTY upgrade lives behind a future helper verb (pty)
//   and an xterm.js renderer; both deferred to keep this phase's blast
//   radius small.

import { iconHTML } from './icons.js';

const SHELL_KEY = 'simple-explorer.terminal.shell';
const TOGGLE_KEY = 'simple-explorer.terminal.open';
const TERMS_KEY = 'simple-explorer.terminal.tabs';

// Per-tab runtime state. Tabs are { id, shell, cwd, pid, lines, input }.
const state = {
  open: load(TOGGLE_KEY) === 'true',
  tabs: [],
  active: 0,
};

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }

export function isTerminalOpen() { return state.open; }
export function setTerminalOpen(open) {
  state.open = !!open;
  save(TOGGLE_KEY, state.open ? 'true' : 'false');
}
export function toggleTerminal() { setTerminalOpen(!state.open); return state.open; }

// Detect available shells on PATH, in VS Code's preference order.
async function detectShell() {
  const cached = load(SHELL_KEY);
  if (cached) return cached;
  const N = window.Neutralino;
  if (!N) return 'cmd.exe';
  // Quick probe -- we don't actually run the shell, just check existence
  // by spawning -Version / --version and discarding output. For
  // simplicity in v1, assume cmd.exe if nothing else is configured;
  // settings UI for shell selection is a follow-up.
  const env = await N.os.getEnvs?.().catch?.(() => null);
  const path = (env?.PATH || env?.Path || '').toLowerCase();
  if (path.includes('powershell\\7')) return 'pwsh.exe';
  if (path.includes('git\\bin')) return 'bash.exe';
  return 'cmd.exe';
}

export async function newTerminal(cwd) {
  const N = window.Neutralino;
  if (!N) return null;
  const shell = await detectShell();
  const tab = {
    id: Date.now() + Math.random(),
    shell, cwd: cwd || '',
    pid: 0, lines: [],
    handlerOff: null,
  };
  try {
    // Neutralino 5.x signature: spawnProcess(command, cwd?). The
    // earlier `{ cwd }` options-object form silently fails native
    // validation -- only positional cwd works.
    const proc = tab.cwd
      ? await N.os.spawnProcess(shell, tab.cwd)
      : await N.os.spawnProcess(shell);
    tab.pid = proc.pid;
    tab.handlerOff = N.events.on('spawnedProcess', (e) => {
      if (e.detail?.id !== proc.id) return;
      if (e.detail.action === 'stdOut' || e.detail.action === 'stdErr') {
        appendOutput(tab, e.detail.data || '');
      } else if (e.detail.action === 'exit') {
        appendOutput(tab, `\n[process exited ${e.detail.data}]\n`);
        tab.proc = null;
      }
    });
    tab.proc = proc;
  } catch (e) {
    appendOutput(tab, `[failed to spawn ${shell}: ${e?.message || e}]\n`);
  }
  state.tabs.push(tab);
  state.active = state.tabs.length - 1;
  return tab;
}

function appendOutput(tab, chunk) {
  tab.lines.push(chunk);
  // Trim ring buffer to last 4 MB equivalent so long-running processes
  // don't unbounded-grow.
  let total = 0;
  for (let i = tab.lines.length - 1; i >= 0; i--) {
    total += tab.lines[i].length;
    if (total > 4 * 1024 * 1024) {
      tab.lines.splice(0, i);
      break;
    }
  }
  // Refresh the active terminal's <pre> if it's mounted.
  const out = document.querySelector(`[data-term-out="${tab.id}"]`);
  if (out) {
    out.textContent = tab.lines.join('');
    out.scrollTop = out.scrollHeight;
  }
}

export async function closeTerminal(idx) {
  const tab = state.tabs[idx];
  if (!tab) return;
  try {
    if (tab.proc) await window.Neutralino.os.updateSpawnedProcess(tab.proc.id, 'exit');
  } catch {}
  state.tabs.splice(idx, 1);
  if (state.active >= state.tabs.length) state.active = Math.max(0, state.tabs.length - 1);
}

export async function switchTerminal(idx) {
  if (idx < 0 || idx >= state.tabs.length) return;
  state.active = idx;
}

async function sendInput(tab, line) {
  const N = window.Neutralino;
  if (!N || !tab.proc) return;
  try { await N.os.updateSpawnedProcess(tab.proc.id, 'stdIn', line + '\n'); }
  catch (e) { console.warn('terminal stdin failed:', e); }
}

// Render the bottom panel into `container`. Returns a cleanup function.
// The panel is height-resizable via a top splitter; the user's chosen
// height persists in localStorage.
export function renderTerminal(container, { onClose, onNewTab, panePath }) {
  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'term';
  container.appendChild(panel);

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
    const tab = document.createElement('button');
    tab.className = 'term__tab' + (i === state.active ? ' term__tab--on' : '');
    tab.textContent = `${i + 1}: ${t.shell.replace(/\.exe$/i, '')}`;
    tab.addEventListener('click', () => { switchTerminal(i); rerender(); });
    // Middle-click closes the tab (Chrome / VS Code convention, matches
    // pane tabs in Phase 4). preventDefault stops the WebView's
    // auto-scroll cursor that middle-button mousedown otherwise triggers.
    tab.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      closeTerminal(i).then(rerender);
    });
    const x = document.createElement('span');
    x.className = 'term__tab-close';
    x.textContent = '×';
    x.addEventListener('click', (e) => { e.stopPropagation(); closeTerminal(i).then(rerender); });
    tab.appendChild(x);
    tabsBar.appendChild(tab);
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

  const out = document.createElement('pre');
  out.className = 'term__out';
  out.dataset.termOut = String(active.id);
  out.textContent = active.lines.join('');
  body.appendChild(out);
  // Auto-scroll to bottom on first render.
  queueMicrotask(() => { out.scrollTop = out.scrollHeight; });

  const inputRow = document.createElement('div');
  inputRow.className = 'term__input-row';
  inputRow.innerHTML = `
    <span class="term__prompt">${escapeHtml(active.cwd || '~')} &gt;</span>
    <input class="term__input" data-term-input autofocus />
  `;
  body.appendChild(inputRow);
  const input = inputRow.querySelector('[data-term-input]');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const line = input.value;
    appendOutput(active, `> ${line}\n`);
    sendInput(active, line);
    input.value = '';
  });
  setTimeout(() => input.focus(), 0);

  // Local rerender redraws just this terminal panel.
  function rerender() {
    renderTerminal(container, { onClose, onNewTab, panePath });
  }
  return () => {};
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

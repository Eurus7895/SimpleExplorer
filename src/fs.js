// FS adapter. Talks to Neutralinojs APIs when available, falls back to mock
// data for visual iteration when src/index.html is opened directly in a
// browser (no Neutralino runtime).
//
// All higher-level code (app.js, pane.js, directions/*.js) imports from this
// module only — keeping the Neutralino surface area in one file.

const N = window.Neutralino;
export const isNative = !!N;

// ── Mock data ───────────────────────────────────────────────────────────────
const SAMPLE = {
  '~/Projects': [
    { name: 'qt5.14.2',         is_dir: true,  size: 0,       modified_ms: Date.now() - 2 * 86400e3, extension: '' },
    { name: 'simple-explorer',  is_dir: true,  size: 0,       modified_ms: Date.now(),                extension: '' },
    { name: 'archive',          is_dir: true,  size: 0,       modified_ms: Date.now() - 7 * 86400e3, extension: '' },
    { name: 'sandbox',          is_dir: true,  size: 0,       modified_ms: Date.now(),                extension: '' },
    { name: 'README.md',        is_dir: false, size: 4300,    modified_ms: Date.now() - 720e3,        extension: 'md' },
    { name: 'package.json',     is_dir: false, size: 1100,    modified_ms: Date.now() - 86400e3,      extension: 'json' },
    { name: 'design-notes.pdf', is_dir: false, size: 2.4e6,   modified_ms: Date.now() - 3 * 86400e3,  extension: 'pdf' },
  ],
  '~/Projects/qt5.14.2': [
    { name: 'bin',          is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'doc',          is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'examples',     is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'include',      is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'lib',          is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'plugins',      is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'translations', is_dir: true,  size: 0,        modified_ms: Date.now(), extension: '' },
    { name: 'configure.bat',     is_dir: false, size: 12000, modified_ms: Date.now(), extension: 'bat' },
    { name: 'LICENSE.LGPLv3',    is_dir: false, size: 7600,  modified_ms: Date.now(), extension: 'txt' },
  ],
  '~/Downloads': [
    { name: 'Screenshot 2025-09-08.png', is_dir: false, size: 1.8e6,  modified_ms: Date.now(),               extension: 'png' },
    { name: 'invoice-october.pdf',       is_dir: false, size: 186000, modified_ms: Date.now(),               extension: 'pdf' },
    { name: 'qt-installer.exe',          is_dir: false, size: 48.2e6, modified_ms: Date.now() - 86400e3,     extension: 'exe' },
    { name: 'tmp',                       is_dir: true,  size: 0,      modified_ms: Date.now(),               extension: '' },
    { name: 'design-handoff.zip',        is_dir: false, size: 14.6e6, modified_ms: Date.now() - 2 * 86400e3, extension: 'zip' },
  ],
  '~/Documents': [
    { name: 'Contracts',              is_dir: true,  size: 0,    modified_ms: Date.now() - 7 * 86400e3,  extension: '' },
    { name: 'Notes',                  is_dir: true,  size: 0,    modified_ms: Date.now(),                extension: '' },
    { name: 'Resume.pdf',             is_dir: false, size: 92000, modified_ms: Date.now() - 30 * 86400e3, extension: 'pdf' },
    { name: 'meeting-2025-10-23.md',  is_dir: false, size: 6000, modified_ms: Date.now(),                extension: 'md' },
  ],
};

// ── Path helpers (sync, no native) ──────────────────────────────────────────
export function joinPath(parent, name) {
  if (!parent) return name;
  const sep = parent.includes('\\') ? '\\' : '/';
  if (parent.endsWith(sep)) return parent + name;
  return parent + sep + name;
}

export function parentPath(path) {
  const sep = path.includes('\\') ? '\\' : '/';
  const idx = path.lastIndexOf(sep);
  if (idx <= 0) return path;
  if (path.match(/^[A-Z]:\\?$/i)) return path;
  const up = path.slice(0, idx);
  if (/^[A-Z]:$/i.test(up)) return up + '\\';
  return up || sep;
}

export function basename(path) {
  const sep = path.includes('\\') ? '\\' : '/';
  const idx = path.lastIndexOf(sep);
  return idx === -1 ? path : path.slice(idx + 1);
}

export function pathSegments(path) {
  if (/^[A-Z]:/i.test(path)) {
    return path.replace(/[\\/]+$/, '').split(/[\\/]+/);
  }
  return path.replace(/^\//, '').replace(/\/+$/, '').split('/').filter(Boolean);
}

export function formatSize(bytes) {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}

export function formatModified(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((today - d) / 86400e3);
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString();
}

// ── Native bridge ───────────────────────────────────────────────────────────
function fakePath(parent, name) {
  return joinPath(parent, name);
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

// PowerShell escapes a literal `'` as `''` inside a single-quoted string.
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// Native helper detection. The MSVC-compiled exe at extras/shellhelp.exe
// replaces three PowerShell shell-outs (properties, trash, drives) and shaves
// ~200 ms cold-start cost off each. If it isn't there yet — typical right
// after `git pull` before someone has compiled it — we fall back to the
// PowerShell paths so the app keeps working.
const HELPER_PATH = 'extras\\shellhelp.exe';
let helperReady = null;
async function helperAvailable() {
  if (!N) return false;
  if (helperReady !== null) return helperReady;
  helperReady = N.filesystem.getStats(HELPER_PATH).then(() => true).catch(() => false);
  return helperReady;
}

async function runHelper(...args) {
  const argstr = args.map((a) => `"${a}"`).join(' ');
  return await exec(`"${HELPER_PATH}" ${argstr}`);
}

async function exec(cmd) {
  if (!N) { console.warn('[mock] exec', cmd); return { stdOut: '', stdErr: '', exitCode: 0 }; }
  try {
    return await N.os.execCommand(cmd, { background: false });
  } catch (e) {
    console.warn('exec failed:', cmd, e);
    return { stdOut: '', stdErr: String(e), exitCode: -1 };
  }
}

async function execBg(cmd) {
  if (!N) { console.warn('[mock] exec(bg)', cmd); return; }
  try { await N.os.execCommand(cmd, { background: true }); }
  catch (e) { console.warn('exec(bg) failed:', cmd, e); }
}

export async function homeDir() {
  if (!N) return '~';
  try {
    const home = await N.os.getEnv('USERPROFILE');
    return home || (await N.os.getEnv('HOME')) || '~';
  } catch { return '~'; }
}

export async function listDir(path) {
  if (!N) {
    const items = SAMPLE[path];
    if (!items) return [];
    return items.map((it) => ({ ...it, path: fakePath(path, it.name) }));
  }
  let entries;
  try {
    entries = await N.filesystem.readDirectory(path);
  } catch (e) {
    console.warn('readDirectory failed:', path, e);
    return [];
  }
  const out = [];
  // Skip the "." and ".." sentinel entries Neutralino includes on some
  // platforms.
  const real = entries.filter((e) => e.entry !== '.' && e.entry !== '..');
  await Promise.all(real.map(async (e) => {
    const full = e.path || joinPath(path, e.entry);
    let size = 0, modified_ms = 0;
    try {
      const s = await N.filesystem.getStats(full);
      size = s.size || 0;
      modified_ms = s.modifiedAt || 0;
    } catch {}
    out.push({
      name: e.entry,
      is_dir: e.type === 'DIRECTORY',
      size,
      modified_ms,
      extension: e.type === 'FILE' ? extOf(e.entry) : '',
      path: full,
    });
  }));
  // Folders first, then case-insensitive name sort.
  out.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return out;
}

export async function makeDir(path) {
  if (!N) { console.warn('[mock] mkdir', path); return; }
  await N.filesystem.createDirectory(path);
}

export async function rename(from, to) {
  if (!N) { console.warn('[mock] rename', from, '->', to); return; }
  await N.filesystem.move(from, to);
}

export async function copy(from, to) {
  if (!N) { console.warn('[mock] copy', from, '->', to); return; }
  await N.filesystem.copy(from, to);
}

export async function move(from, to) {
  if (!N) { console.warn('[mock] move', from, '->', to); return; }
  await N.filesystem.move(from, to);
}

// Send a path to the Recycle Bin. Prefers the native helper (one
// IFileOperation call, ~50 ms); falls back to PowerShell +
// Microsoft.VisualBasic.FileIO when the helper hasn't been built yet
// (~250-400 ms, but still uses the documented Microsoft recycle path).
export async function deleteToTrash(path) {
  if (!N) { console.warn('[mock] trash', path); return; }
  if (await helperAvailable()) {
    await runHelper('trash', path);
    return;
  }
  let isDir = false;
  try {
    const s = await N.filesystem.getStats(path);
    isDir = !!s.isDirectory;
  } catch {}
  const fn = isDir ? 'DeleteDirectory' : 'DeleteFile';
  const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${fn}(${psQuote(path)}, 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  await exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
}

export async function deletePermanent(path) {
  if (!N) { console.warn('[mock] delete!', path); return; }
  await N.filesystem.remove(path);
}

export async function listDrives() {
  if (!N) {
    return [
      { name: '(C:)', path: 'C:\\', free_bytes: 0, total_bytes: 0 },
      { name: '(D:)', path: 'D:\\', free_bytes: 0, total_bytes: 0 },
    ];
  }
  if (await helperAvailable()) {
    const r = await runHelper('drives');
    try {
      const arr = JSON.parse(r.stdOut.trim() || '[]');
      return arr.map((d) => ({
        name: `(${d.letter}:)`,
        path: `${d.letter}:\\`,
        free_bytes: Number(d.free) || 0,
        total_bytes: Number(d.total) || 0,
      }));
    } catch { return []; }
  }
  const ps = "Get-PSDrive -PSProvider FileSystem | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Free = [int64]$_.Free; Used = [int64]$_.Used } } | ConvertTo-Json -Compress";
  const r = await exec(`powershell -NoProfile -Command "${ps}"`);
  try {
    const raw = JSON.parse(r.stdOut.trim() || '[]');
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((d) => ({
      name: `(${d.Name}:)`,
      path: `${d.Name}:\\`,
      free_bytes: Number(d.Free) || 0,
      total_bytes: (Number(d.Free) || 0) + (Number(d.Used) || 0),
    }));
  } catch {
    return [];
  }
}

export async function openInOS(path) {
  if (!N) { console.warn('[mock] open', path); return; }
  try { await N.os.open(path); }
  catch (e) { console.warn('os.open failed:', path, e); }
}

export async function revealInOS(path) {
  if (!N) { console.warn('[mock] reveal', path); return; }
  await execBg(`explorer.exe /select,"${path}"`);
}

// ── Curated context-menu actions (new vs Tauri version) ─────────────────────

// Show the real Windows Properties dialog. Prefers the native helper
// (~50 ms via ShellExecuteEx + "properties" verb); falls back to a
// PowerShell + Shell.Application COM call when the helper hasn't been
// built yet (~250-400 ms).
export async function showProperties(path) {
  if (!N) { console.warn('[mock] properties', path); return; }
  if (await helperAvailable()) {
    await N.os.execCommand(`"${HELPER_PATH}" properties "${path}"`, { background: true });
    return;
  }
  const ps = `$s = New-Object -ComObject Shell.Application; $i = $s.NameSpace((Split-Path ${psQuote(path)} -Parent)).ParseName((Split-Path ${psQuote(path)} -Leaf)); $i.InvokeVerb('Properties')`;
  await execBg(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
}

export async function openInVSCode(path) {
  if (!N) { console.warn('[mock] code', path); return; }
  await execBg(`code "${path}"`);
}

export async function openInTerminal(path) {
  if (!N) { console.warn('[mock] wt', path); return; }
  // Prefer Windows Terminal; cmd.exe is the universal fallback.
  const r = await exec(`where wt.exe`);
  if (r.exitCode === 0 && r.stdOut.trim()) {
    await execBg(`wt.exe -d "${path}"`);
  } else {
    await execBg(`cmd /K cd /D "${path}"`);
  }
}

export async function copyPath(path) {
  if (!N) { console.warn('[mock] copy path', path); return; }
  try { await N.clipboard.writeText(path); }
  catch (e) { console.warn('clipboard.writeText failed:', e); }
}

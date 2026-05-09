// Recursive filename search inside a directory tree.
//
// BFS over fs.listDir with a per-slice time budget so the UI stays
// interactive on large trees. Cancellable via AbortSignal — callers
// keep a controller, abort it on new query / pane switch / Esc.
//
// Match policy: substring over the entry name, locale-aware,
// case-insensitive. Filename only — content search is out of scope.
//
// Limits: hard cap on matches (see HARD_CAP) and a skip list for
// noise directories. The skip list is pragmatic, not configurable
// in v1; tweak SKIP_NAMES if it omits something you care about.

import * as fs from './fs.js';

const SLICE_MS = 16;
const HARD_CAP = 5000;
const SKIP_NAMES = new Set([
  'node_modules', '.git', '.svn', '.hg', '.next', '.cache',
  'dist', 'build', '__pycache__', '.venv', 'venv',
]);

export async function recursiveSearch({ root, query, signal, onMatch, onProgress }) {
  const q = (query || '').toLowerCase();
  if (!q) {
    onProgress?.({ scanned: 0, matched: 0, done: true });
    return;
  }
  const queue = [root];
  let scanned = 0;
  let matched = 0;
  let sliceStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  while (queue.length) {
    if (signal?.aborted) {
      onProgress?.({ scanned, matched, done: true, aborted: true });
      return;
    }
    const dir = queue.shift();
    let entries = [];
    try { entries = await fs.listDir(dir); } catch { continue; }
    for (const e of entries) {
      if (signal?.aborted) {
        onProgress?.({ scanned, matched, done: true, aborted: true });
        return;
      }
      scanned++;
      if (e.name.toLowerCase().includes(q)) {
        matched++;
        onMatch?.(e);
        if (matched >= HARD_CAP) {
          onProgress?.({ scanned, matched, done: true, capped: true });
          return;
        }
      }
      if (e.is_dir && !SKIP_NAMES.has(e.name)) queue.push(e.path);
    }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - sliceStart > SLICE_MS) {
      onProgress?.({ scanned, matched, done: false });
      await new Promise((r) => setTimeout(r, 0));
      sliceStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    }
  }
  onProgress?.({ scanned, matched, done: true });
}

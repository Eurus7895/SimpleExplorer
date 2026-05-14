// Phase 8c — multi-item copy/move with progress, conflict resolution,
// and cancellation. Pre-8c, app.js's onDrop / onForeignDrop /
// doAction('copy'|'move') each looped over fs.copy / fs.move, swallowing
// errors and silently overwriting same-named destinations. This module
// is the single replacement: one entry point (`runTransfer`) that drives
// the loop, raises a conflict modal when needed, and exposes progress +
// cancel through a strip pinned to the bottom of the window.
//
// Out of scope for v1: pause/resume, post-completion "show in Explorer"
// hint, copy-to-clipboard-then-paste, recursive byte totals for folders
// (we report bytes lazily off each item's post-op getStats, no pre-walk).

import * as fs from './fs.js';

let active = null; // { signal, strip }  – one concurrent transfer for v1

// Items: [{ src, dst }]. Returns when the transfer finishes (success
// or otherwise); never throws. onDone(summary) fires after the strip
// finishes its self-fade so callers can refresh affected panes.
export async function runTransfer({ op, items, onDone }) {
  if (!items?.length) { onDone?.({ success: 0, skipped: 0, errored: 0, aborted: false }); return; }
  if (active) {
    // v1: one transfer at a time. The second caller's items are dropped
    // with a console warning — the UI is single-strip so concurrent
    // transfers would race over the same DOM.
    console.warn('transfer in progress; ignoring new request');
    return;
  }

  const controller = new AbortController();
  const strip = mountStrip({
    op,
    total: items.length,
    onCancel: () => controller.abort(),
  });
  active = { controller, strip };

  let applyToAll = null;
  let doneBytes = 0;
  let success = 0, skipped = 0, errored = 0;

  for (let i = 0; i < items.length; i++) {
    if (controller.signal.aborted) break;
    const item = items[i];
    strip.update({ index: i + 1, name: fs.basename(item.dst) });

    let target = item.dst;
    if (await fs.pathExists(item.dst)) {
      const choice = applyToAll ?? await showConflictModal({
        op,
        src: item.src,
        dst: item.dst,
        remaining: items.length - i,
      });
      if (!choice || choice.action === 'cancel') {
        controller.abort();
        break;
      }
      if (choice.applyToAll) applyToAll = choice;
      if (choice.action === 'skip') { skipped++; continue; }
      if (choice.action === 'replace') {
        try { await fs.deletePermanent(item.dst); }
        catch (e) {
          console.warn('replace pre-delete failed:', e);
          errored++; continue;
        }
      } else if (choice.action === 'keepboth') {
        target = await uniqueName(item.dst);
      }
    }

    try {
      if (op === 'copy') await fs.copy(item.src, target);
      else                await fs.move(item.src, target);
      success++;
      const stats = await safeStat(target);
      if (stats?.size) doneBytes += stats.size;
      strip.update({ bytes: doneBytes });
    } catch (e) {
      console.warn(`${op} failed: ${item.src} -> ${target}`, e);
      errored++;
    }
  }

  const aborted = controller.signal.aborted;
  strip.finish({ success, skipped, errored, aborted });
  active = null;
  onDone?.({ success, skipped, errored, aborted });
}

async function safeStat(path) {
  try { return await window.Neutralino?.filesystem.getStats(path); }
  catch { return null; }
}

// `name.ext` → `name (2).ext`, `(3)`, … until a free name is found.
// For directories (no extension) we tack ` (N)` onto the end. Probes
// via fs.pathExists; bounded at 9999 to avoid infinite loops on a
// truly pathological tree.
async function uniqueName(dst) {
  const parent = fs.parentPath(dst);
  const base = fs.basename(dst);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  for (let n = 2; n < 10000; n++) {
    const candidate = fs.joinPath(parent, `${stem} (${n})${ext}`);
    if (!(await fs.pathExists(candidate))) return candidate;
  }
  return dst; // fall through — caller will see a plain conflict error
}

// ── Progress strip ────────────────────────────────────────────────────

function mountStrip({ op, total, onCancel }) {
  // Single global strip pinned to the bottom edge of the window. Lives
  // on document.body so the full-app render() cycle doesn't wipe it.
  let strip = document.querySelector('.transfer-strip');
  if (strip) strip.remove();
  strip = document.createElement('div');
  strip.className = 'transfer-strip';
  strip.innerHTML = `
    <div class="transfer-strip__title">${op === 'copy' ? 'Copying' : 'Moving'} 0 of ${total}</div>
    <div class="transfer-strip__bar"><div class="transfer-strip__fill"></div></div>
    <div class="transfer-strip__bytes"></div>
    <button class="transfer-strip__cancel" title="Cancel">×</button>
  `;
  document.body.appendChild(strip);
  const $title = strip.querySelector('.transfer-strip__title');
  const $fill  = strip.querySelector('.transfer-strip__fill');
  const $bytes = strip.querySelector('.transfer-strip__bytes');
  const $cancel = strip.querySelector('.transfer-strip__cancel');
  $cancel.addEventListener('click', () => {
    $cancel.disabled = true;
    onCancel?.();
  });

  let lastIndex = 0;
  return {
    update({ index, name, bytes }) {
      if (index !== undefined) {
        lastIndex = index;
        const label = name ? ` — ${name}` : '';
        $title.textContent = `${op === 'copy' ? 'Copying' : 'Moving'} ${index} of ${total}${label}`;
        $fill.style.width = Math.min(100, Math.round((index / total) * 100)) + '%';
      }
      if (bytes !== undefined) {
        $bytes.textContent = `${fs.formatSize(bytes)} transferred`;
      }
    },
    finish({ success, skipped, errored, aborted }) {
      const verb = op === 'copy' ? 'Copied' : 'Moved';
      const parts = [];
      if (success) parts.push(`${verb.toLowerCase()} ${success}`);
      if (skipped) parts.push(`skipped ${skipped}`);
      if (errored) parts.push(`${errored} failed`);
      const summary = parts.join(' · ') || (aborted ? 'cancelled' : 'nothing to do');
      $title.textContent = aborted ? `Cancelled — ${summary}` : `${verb} — ${summary}`;
      $fill.style.width = '100%';
      strip.classList.add('transfer-strip--done');
      $cancel.textContent = '✕';
      $cancel.disabled = false;
      $cancel.title = 'Dismiss';
      // Auto-fade after 4 s; user can dismiss sooner with the ✕.
      setTimeout(() => strip.classList.add('transfer-strip--leaving'), 4000);
      setTimeout(() => strip.remove(), 4400);
      $cancel.addEventListener('click', () => strip.remove(), { once: true });
    },
  };
}

// ── Conflict modal ───────────────────────────────────────────────────

async function showConflictModal({ op, src, dst, remaining }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'conflict-overlay';
    overlay.innerHTML = `
      <div class="conflict-modal" role="dialog" aria-modal="true">
        <div class="conflict-modal__header">Destination already has this name</div>
        <div class="conflict-modal__body">
          <div class="conflict-modal__path"><strong>${escapeHtml(fs.basename(dst))}</strong></div>
          <div class="conflict-modal__sub">in ${escapeHtml(fs.parentPath(dst))}</div>
          <div class="conflict-modal__hint">Source: ${escapeHtml(src)}</div>
        </div>
        ${remaining > 1 ? `
        <label class="conflict-modal__applyall">
          <input type="checkbox" data-applyall> Apply to all remaining (${remaining})
        </label>` : ''}
        <div class="conflict-modal__buttons">
          <button class="conflict-modal__btn" data-action="cancel">Cancel</button>
          <button class="conflict-modal__btn" data-action="replace">Replace</button>
          <button class="conflict-modal__btn" data-action="keepboth">Keep Both</button>
          <button class="conflict-modal__btn conflict-modal__btn--primary" data-action="skip" autofocus>Skip</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
    };
    const decide = (action) => {
      const applyToAll = !!overlay.querySelector('[data-applyall]')?.checked;
      cleanup();
      resolve({ action, applyToAll });
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) decide('cancel');
      const btn = e.target.closest('[data-action]');
      if (btn) decide(btn.dataset.action);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); decide('cancel'); }
      else if (e.key === 'Enter') { e.preventDefault(); decide('skip'); }
    };
    document.addEventListener('keydown', onKey, true);

    // Focus the default (Skip) so Enter binds correctly even though
    // the autofocus attribute is unreliable on dynamically-inserted DOM.
    requestAnimationFrame(() => {
      overlay.querySelector('[data-action="skip"]')?.focus();
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

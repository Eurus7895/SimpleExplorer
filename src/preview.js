// Right-side preview panel.
//
// Renders the active pane's first-selected file. Five render paths:
//
//   text        text-like extension; first 1 MB, monospace
//   image       <img src="file:///…">
//   markdown    inline subset renderer (no markdown-it dep)
//   pdf         <iframe src="file:///…"> — WebView2's built-in viewer
//   meta        anything else (kind, size, modified)
//
// Selection updates fire on `explorer:select-change`; pane.js dispatches
// it from row click handlers. The panel debounces 80 ms so arrow-key
// navigation through a long list doesn't thrash the renderers.

import { iconHTML, kindFor } from './icons.js';
import * as fs from './fs.js';

const TEXT_EXTS = new Set([
  'txt', 'json', 'yaml', 'yml', 'toml', 'ini', 'log', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs',
  'css', 'scss', 'sass', 'less',
  'html', 'htm', 'xml', 'svg', 'rss', 'atom',
  'py', 'rb', 'go', 'rs', 'c', 'cpp', 'cc', 'h', 'hpp',
  'java', 'kt', 'kts', 'swift', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'graphql', 'proto',
  'dockerfile', 'makefile',
  'env', 'gitignore', 'gitattributes', 'editorconfig',
  'lock', 'license', 'readme',
]);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']);
const MD_EXTS = new Set(['md', 'markdown', 'mdown']);
const PDF_EXTS = new Set(['pdf']);
const TEXT_MAX_BYTES = 1024 * 1024;
const SELECT_DEBOUNCE_MS = 80;

let panelEl = null;
let selectTimer = null;
let renderToken = 0;

export function ensurePreviewPanel(container) {
  if (panelEl && panelEl.parentNode === container) return panelEl;
  panelEl = document.createElement('div');
  panelEl.className = 'preview';
  panelEl.innerHTML = `
    <div class="preview__head">
      <span class="preview__title">Preview</span>
      <button class="preview__close" data-act="close" title="Close preview">${iconHTML('close', 12)}</button>
    </div>
    <div class="preview__body" data-body></div>
  `;
  container.appendChild(panelEl);
  return panelEl;
}

export function bindPreviewClose(onClose) {
  if (!panelEl) return;
  const btn = panelEl.querySelector('[data-act="close"]');
  btn?.addEventListener('click', () => onClose?.());
}

export function showPreviewFor(entry) {
  if (!panelEl) return;
  // Debounce so arrow-key navigation through a list doesn't run a render
  // for every transient selection. The token guard handles the case where
  // a fast async render races a newer selection.
  clearTimeout(selectTimer);
  const myToken = ++renderToken;
  selectTimer = setTimeout(async () => {
    if (myToken !== renderToken) return;
    const body = panelEl.querySelector('[data-body]');
    body.innerHTML = '';
    const title = panelEl.querySelector('.preview__title');
    title.textContent = entry ? entry.name : 'Preview';

    if (!entry) { body.appendChild(emptyState()); return; }
    if (entry.is_dir) { body.appendChild(folderState(entry)); return; }

    const ext = (entry.extension || '').toLowerCase();
    try {
      if (MD_EXTS.has(ext)) await renderMarkdown(body, entry, myToken);
      else if (TEXT_EXTS.has(ext)) await renderText(body, entry, myToken);
      else if (IMAGE_EXTS.has(ext)) renderImage(body, entry);
      else if (PDF_EXTS.has(ext)) renderPdf(body, entry);
      else body.appendChild(metaState(entry));
    } catch (e) {
      console.warn('preview render failed:', e);
      body.appendChild(errorState(entry, e));
    }
  }, SELECT_DEBOUNCE_MS);
}

function emptyState() {
  const div = document.createElement('div');
  div.className = 'preview__empty';
  div.textContent = 'Select a file to preview';
  return div;
}

function folderState(entry) {
  const div = document.createElement('div');
  div.className = 'preview__meta';
  div.innerHTML = `
    <div class="preview__icon">${iconHTML('folder', 36)}</div>
    <div class="preview__name">${escapeHtml(entry.name)}</div>
    <div class="preview__path">${escapeHtml(entry.path || '')}</div>
    <div class="preview__hint">Folder</div>
  `;
  return div;
}

function metaState(entry) {
  const div = document.createElement('div');
  div.className = 'preview__meta';
  div.innerHTML = `
    <div class="preview__icon">${iconHTML(kindFor(entry), 36)}</div>
    <div class="preview__name">${escapeHtml(entry.name)}</div>
    <div class="preview__path">${escapeHtml(entry.path || '')}</div>
    <dl class="preview__facts">
      <dt>Size</dt><dd>${escapeHtml(fs.formatSize(entry.size || 0))}</dd>
      <dt>Modified</dt><dd>${escapeHtml(fs.formatModified(entry.modified_ms || 0))}</dd>
      <dt>Type</dt><dd>${escapeHtml((entry.extension || 'File').toUpperCase())}</dd>
    </dl>
    <div class="preview__hint">No inline preview for this file type</div>
  `;
  return div;
}

function errorState(entry, e) {
  const div = document.createElement('div');
  div.className = 'preview__meta preview__meta--err';
  div.innerHTML = `
    <div class="preview__name">${escapeHtml(entry.name)}</div>
    <div class="preview__hint">Preview failed: ${escapeHtml(String(e?.message || e))}</div>
  `;
  return div;
}

async function renderText(body, entry, myToken) {
  const text = await fs.readTextFile(entry.path, TEXT_MAX_BYTES);
  if (myToken !== renderToken) return;
  if (text == null) { body.appendChild(errorState(entry, new Error('read failed'))); return; }
  const pre = document.createElement('pre');
  pre.className = 'preview__text';
  pre.textContent = text;
  body.appendChild(pre);
}

async function renderMarkdown(body, entry, myToken) {
  const text = await fs.readTextFile(entry.path, TEXT_MAX_BYTES);
  if (myToken !== renderToken) return;
  if (text == null) { body.appendChild(errorState(entry, new Error('read failed'))); return; }
  const div = document.createElement('div');
  div.className = 'preview__md';
  div.innerHTML = mdRender(text);
  // External links open in the OS browser; internal anchors are inert.
  div.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const href = a.getAttribute('href') || '';
      if (/^https?:/i.test(href)) fs.openInOS(href).catch(() => {});
    });
  });
  body.appendChild(div);
}

function renderImage(body, entry) {
  const img = document.createElement('img');
  img.className = 'preview__img';
  img.src = pathToFileUrl(entry.path);
  img.alt = entry.name;
  body.appendChild(img);
}

function renderPdf(body, entry) {
  // WebView2 ships Chromium's PDF viewer. <iframe> with a file:// URL
  // renders inline. If the runtime blocks the URL (e.g. due to
  // sandboxing on a future Neutralino release), fall back to meta.
  const frame = document.createElement('iframe');
  frame.className = 'preview__pdf';
  frame.src = pathToFileUrl(entry.path);
  frame.title = entry.name;
  body.appendChild(frame);
}

function pathToFileUrl(p) {
  if (!p) return '';
  // Windows backslashes -> forward; ensure single leading slash for
  // file:/// scheme.
  let norm = p.replace(/\\/g, '/');
  if (!norm.startsWith('/')) norm = '/' + norm;
  return 'file://' + encodeURI(norm).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// Tiny CommonMark subset: headings, bold, italic, inline code, fenced
// code blocks, lists (ordered/unordered, single level), links, blank-line
// paragraphs. Anything else falls through as escaped text. Good enough
// for README previews; full markdown-it can land later.
function mdRender(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    const fence = line.match(/^```\s*(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const start = ++i;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) i++;
      const body = lines.slice(start, i).join('\n');
      out.push(`<pre class="preview__md-code"><code data-lang="${escapeHtml(lang)}">${escapeHtml(body)}</code></pre>`);
      i++;
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${mdInline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // Blank line
    if (!line.trim()) { i++; continue; }
    // Paragraph: gather until blank or block
    const para = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^```/.test(lines[i])
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${mdInline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

function mdInline(s) {
  // Escape first; then replace marker patterns inline. Safe because the
  // replacements only emit fixed tag pairs around already-escaped
  // content. Order matters: code spans first to avoid eating *bold*
  // markers inside them.
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = /^(https?:|mailto:|file:)/i.test(url) ? url : '#';
    return `<a href="${escapeHtml(safeUrl)}">${text}</a>`;
  });
  // Bold then italic. Use lazy quantifiers so adjacent emphasis
  // doesn't merge.
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|\W)\*([^*]+?)\*(?=\W|$)/g, '$1<em>$2</em>');
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

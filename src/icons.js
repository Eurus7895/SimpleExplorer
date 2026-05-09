// Inline SVG icon set. Ported verbatim from the design bundle
// (explorer-shared.jsx:67-163). All icons are 16-viewbox, currentColor where
// stroked. icon(name, size?) returns an HTMLElement.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const SVG = {
  folder:      `<path d="M1.5 4.5a1 1 0 0 1 1-1h3.4l1.4 1.5h6.2a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5Z" fill="#FFD479" stroke="#C9952B" stroke-width="1"/>`,
  'folder-open': `<path d="M1.5 5a1 1 0 0 1 1-1h3.5L7.4 5.5h6.1a1 1 0 0 1 1 1v.5h-12V5Z" fill="#FFE6A8" stroke="#C9952B" stroke-width="1"/><path d="M2 7h12.5l-1.4 5a1 1 0 0 1-1 .8H2.5a1 1 0 0 1-1-.8L2 7Z" fill="#FFD479" stroke="#C9952B" stroke-width="1"/>`,
  file:        `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#fff" stroke="#9aa3b2" stroke-width="1"/><path d="M9.5 1.5v3h3" fill="none" stroke="#9aa3b2" stroke-width="1"/>`,
  md:          `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#eef2ff" stroke="#6366f1" stroke-width="1"/><text x="8" y="11.5" font-size="4.5" font-weight="700" fill="#6366f1" text-anchor="middle" font-family="ui-sans-serif">MD</text>`,
  pdf:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#fef2f2" stroke="#dc2626" stroke-width="1"/><text x="8" y="11.5" font-size="4" font-weight="700" fill="#dc2626" text-anchor="middle" font-family="ui-sans-serif">PDF</text>`,
  json:        `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#fefce8" stroke="#ca8a04" stroke-width="1"/><text x="8" y="11.8" font-size="3.5" font-weight="700" fill="#ca8a04" text-anchor="middle" font-family="ui-sans-serif">JSON</text>`,
  png:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#ecfdf5" stroke="#059669" stroke-width="1"/><text x="8" y="11.5" font-size="4" font-weight="700" fill="#059669" text-anchor="middle" font-family="ui-sans-serif">PNG</text>`,
  zip:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#f5f3ff" stroke="#7c3aed" stroke-width="1"/><text x="8" y="11.5" font-size="4" font-weight="700" fill="#7c3aed" text-anchor="middle" font-family="ui-sans-serif">ZIP</text>`,
  exe:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#f0f9ff" stroke="#0284c7" stroke-width="1"/><text x="8" y="11.5" font-size="4" font-weight="700" fill="#0284c7" text-anchor="middle" font-family="ui-sans-serif">EXE</text>`,
  txt:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#f8fafc" stroke="#64748b" stroke-width="1"/><path d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h3" stroke="#64748b" stroke-width=".8"/>`,
  bat:         `<path d="M3.5 1.5h6l3 3v10h-9v-13Z" fill="#f8fafc" stroke="#64748b" stroke-width="1"/><path d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h3" stroke="#64748b" stroke-width=".8"/>`,
  home:        `<path ${STROKE} d="M2.5 7.5 8 3l5.5 4.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/>`,
  doc:         `<g ${STROKE}><path d="M4 2h5l3 3v9H4V2Z"/><path d="M9 2v3h3"/></g>`,
  down:        `<path ${STROKE} d="M8 3v8M5 8l3 3 3-3M3 13h10"/>`,
  pic:         `<g ${STROKE}><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><circle cx="6" cy="7" r="1"/><path d="m3 12 3-3 3 2 2-2 2 3"/></g>`,
  desk:        `<g ${STROKE}><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 11v2M10 11v2M5 13h6"/></g>`,
  drive:       `<g ${STROKE}><rect x="2.5" y="5" width="11" height="6" rx="1"/><circle cx="11.5" cy="8" r=".7" fill="currentColor" stroke="none"/></g>`,
  pin:         `<path ${STROKE} d="M9.5 2.5 13.5 6.5l-3 1-3.5 3.5-1.5-1.5L9 6 9.5 2.5ZM6 10l-3 3"/>`,
  search:      `<g ${STROKE}><circle cx="7" cy="7" r="4"/><path d="m10 10 3.5 3.5"/></g>`,
  eye:         `<g ${STROKE}><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/></g>`,
  back:        `<path ${STROKE} d="M10 3 5 8l5 5"/>`,
  fwd:         `<path ${STROKE} d="m6 3 5 5-5 5"/>`,
  up:          `<path ${STROKE} d="M8 12V4M4 8l4-4 4 4"/>`,
  plus:        `<path ${STROKE} d="M8 3v10M3 8h10"/>`,
  close:       `<path ${STROKE} d="m4 4 8 8M12 4l-8 8"/>`,
  'split-h':   `<g ${STROKE}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 3v10"/></g>`,
  'split-v':   `<g ${STROKE}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 8h12"/></g>`,
  grid4:       `<g ${STROKE}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 3v10M2 8h12"/></g>`,
  one:         `<rect ${STROKE} x="2" y="3" width="12" height="10" rx="1"/>`,
  tree:        `<path ${STROKE} d="M3 4h2M3 8h4M3 12h4M5 4v8"/>`,
  list:        `<path ${STROKE} d="M3 4h10M3 8h10M3 12h10"/>`,
  // Windows-style view-mode glyphs.
  // details: small icon block + label line on each row.
  'view-details': `<g ${STROKE}><rect x="2.5" y="3.5" width="2" height="2"/><path d="M6 4.5h7.5"/><rect x="2.5" y="7.5" width="2" height="2"/><path d="M6 8.5h7.5"/><rect x="2.5" y="11.5" width="2" height="2"/><path d="M6 12.5h7.5"/></g>`,
  // compact: denser horizontal lines, no icons.
  'view-compact': `<path ${STROKE} d="M3 3.5h10M3 6h10M3 8.5h10M3 11h10M3 13.5h10"/>`,
  // tiles: 2×2 grid of cells, each with a small icon + label line inside.
  'view-tiles':   `<g ${STROKE}><rect x="2" y="2.5" width="5.5" height="5" rx=".5"/><rect x="3" y="3.5" width="1.5" height="1.5" fill="currentColor" stroke="none"/><path d="M3 6h3.5"/><rect x="8.5" y="2.5" width="5.5" height="5" rx=".5"/><rect x="9.5" y="3.5" width="1.5" height="1.5" fill="currentColor" stroke="none"/><path d="M9.5 6h3.5"/><rect x="2" y="9" width="5.5" height="5" rx=".5"/><rect x="3" y="10" width="1.5" height="1.5" fill="currentColor" stroke="none"/><path d="M3 12.5h3.5"/><rect x="8.5" y="9" width="5.5" height="5" rx=".5"/><rect x="9.5" y="10" width="1.5" height="1.5" fill="currentColor" stroke="none"/><path d="M9.5 12.5h3.5"/></g>`,
  columns:     `<g ${STROKE}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6 3v10M10 3v10"/></g>`,
  star:        `<path ${STROKE} d="m8 2 1.7 4 4.3.4-3.3 2.9 1 4.2L8 11.2 4.3 13.5l1-4.2L2 6.4l4.3-.4L8 2Z"/>`,
  clock:       `<g ${STROKE}><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></g>`,
  cmd:         `<g ${STROKE}><path d="M5 4.5h6l2 2v3l-2 2H5l-2-2v-3l2-2Z"/><path d="m6 7 2 2 2-2"/></g>`,
  copy:        `<g ${STROKE}><rect x="3" y="3" width="8" height="8" rx="1"/><path d="M11 5h2v8H5v-2"/></g>`,
  trash:       `<path ${STROKE} d="M3 5h10M6 5V3.5h4V5M5 5l.7 8h4.6L11 5M7 7.5v4M9 7.5v4"/>`,
  rename:      `<path ${STROKE} d="M2 11.5 3.5 13l8.5-8.5L10.5 3 2 11.5ZM10 4.5 12 6.5"/>`,
  compare:     `<g ${STROKE}><rect x="2" y="3" width="5" height="10" rx=".5"/><rect x="9" y="3" width="5" height="10" rx=".5"/><path d="M7 8h2"/></g>`,
  newfolder:   `<g ${STROKE}><path d="M2 5a1 1 0 0 1 1-1h3l1.4 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z"/><path d="M8 8v3M6.5 9.5h3"/></g>`,
  sun:         `<g ${STROKE}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.7 3.3l-1 1M4.3 11.7l-1 1M12.7 12.7l-1-1M4.3 4.3l-1-1"/></g>`,
  moon:        `<path ${STROKE} d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z"/>`,
  sort:        `<path ${STROKE} d="M4 3v10M2 11l2 2 2-2M10 5h4M10 8h3M10 11h2"/>`,
  more:        `<g ${STROKE}><circle cx="3.5" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="12.5" cy="8" r=".8" fill="currentColor"/></g>`,
  workspace:   `<g ${STROKE}><rect x="2" y="3" width="5" height="4.5" rx=".5"/><rect x="9" y="3" width="5" height="4.5" rx=".5"/><rect x="2" y="8.5" width="12" height="4.5" rx=".5"/></g>`,
  sidebar:     `<g ${STROKE}><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6 3v10"/></g>`,
};

export function icon(name, size = 16) {
  const src = SVG[name] || SVG.file;
  const wrap = document.createElement('span');
  wrap.className = 'icn';
  wrap.style.width = size + 'px';
  wrap.style.height = size + 'px';
  wrap.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" style="display:block">${src}</svg>`;
  return wrap;
}

export function iconHTML(name, size = 16) {
  const src = SVG[name] || SVG.file;
  return `<svg class="icn" viewBox="0 0 16 16" width="${size}" height="${size}">${src}</svg>`;
}

export function kindFor(entry) {
  if (entry.is_dir) return 'folder';
  const ext = (entry.extension || '').toLowerCase();
  if (['md', 'pdf', 'json', 'png', 'zip', 'exe', 'txt', 'bat'].includes(ext)) return ext;
  if (['jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'png';
  if (['rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  if (['js', 'ts', 'tsx', 'jsx', 'css', 'html', 'rs', 'py', 'sh', 'yml', 'yaml', 'toml'].includes(ext)) return 'txt';
  return 'file';
}

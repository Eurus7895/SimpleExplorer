// Grid layout + splitter wiring. Owns the per-layout grid template and
// splitter geometry so the direction modules stay chrome-only. Splits are
// stored as { col?: 0..1, row?: 0..1 } per layout id; the grid uses fr
// units derived from those ratios with a 6 px gutter track between panes.

const GUTTER_PX = 6;
const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

export const LAYOUT_DEFS = {
  '1':  { panes: 1 },
  '2v': { panes: 2, hasColSplit: true },
  '2h': { panes: 2, hasRowSplit: true },
  '3':  { panes: 3, hasColSplit: true, hasRowSplit: true, thirdSpansFull: true },
  '4':  { panes: 4, hasColSplit: true, hasRowSplit: true },
};

export const DEFAULT_SPLITS = {
  '1':  {},
  '2v': { col: 0.5 },
  '2h': { row: 0.5 },
  '3':  { col: 0.5, row: 0.6 },
  '4':  { col: 0.5, row: 0.5 },
};

export function applyLayout(grid, layoutId, splits, paneCards, onChange) {
  const def = LAYOUT_DEFS[layoutId] || LAYOUT_DEFS['2v'];
  const col = clamp(splits?.col ?? 0.5);
  const row = clamp(splits?.row ?? 0.5);
  const colTrack = `${col}fr ${GUTTER_PX}px ${1 - col}fr`;
  const rowTrack = `${row}fr ${GUTTER_PX}px ${1 - row}fr`;

  if (layoutId === '1') {
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = '1fr';
    place(paneCards[0], '1', '1');
    grid.appendChild(paneCards[0]);
    return;
  }

  if (layoutId === '2v') {
    grid.style.gridTemplateColumns = colTrack;
    grid.style.gridTemplateRows = '1fr';
    place(paneCards[0], '1', '1');
    place(paneCards[1], '3', '1');
    grid.appendChild(paneCards[0]);
    grid.appendChild(makeSplitter('col', '2', '1', grid, splits, onChange));
    grid.appendChild(paneCards[1]);
    return;
  }

  if (layoutId === '2h') {
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = rowTrack;
    place(paneCards[0], '1', '1');
    place(paneCards[1], '1', '3');
    grid.appendChild(paneCards[0]);
    grid.appendChild(makeSplitter('row', '1', '2', grid, splits, onChange));
    grid.appendChild(paneCards[1]);
    return;
  }

  if (layoutId === '3') {
    grid.style.gridTemplateColumns = colTrack;
    grid.style.gridTemplateRows = rowTrack;
    place(paneCards[0], '1', '1');
    place(paneCards[1], '3', '1');
    place(paneCards[2], '1 / -1', '3');
    grid.appendChild(paneCards[0]);
    grid.appendChild(makeSplitter('col', '2', '1', grid, splits, onChange));
    grid.appendChild(paneCards[1]);
    grid.appendChild(makeSplitter('row', '1 / -1', '2', grid, splits, onChange));
    grid.appendChild(paneCards[2]);
    return;
  }

  if (layoutId === '4') {
    grid.style.gridTemplateColumns = colTrack;
    grid.style.gridTemplateRows = rowTrack;
    place(paneCards[0], '1', '1');
    place(paneCards[1], '3', '1');
    place(paneCards[2], '1', '3');
    place(paneCards[3], '3', '3');
    grid.appendChild(paneCards[0]);
    grid.appendChild(paneCards[1]);
    grid.appendChild(paneCards[2]);
    grid.appendChild(paneCards[3]);
    grid.appendChild(makeSplitter('col', '2', '1 / -1', grid, splits, onChange));
    grid.appendChild(makeSplitter('row', '1 / -1', '2', grid, splits, onChange));
  }
}

function place(card, col, row) {
  card.style.gridColumn = col;
  card.style.gridRow = row;
}

// During a drag we coalesce mousemove updates to one per animation
// frame (raw mousemoves can fire 100+ Hz, faster than we can repaint),
// then commit the final ratio once on mouseup so localStorage only takes
// one write per drag. Pane content gets pointer-events:none via the body
// .is-resizing-* class so .row:hover repaints don't fight the reflow.
function makeSplitter(axis, col, row, grid, splits, onChange) {
  const el = document.createElement('div');
  el.className = `splitter splitter--${axis}`;
  el.style.gridColumn = col;
  el.style.gridRow = row;

  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('is-resizing-' + axis);
    const rect = grid.getBoundingClientRect();
    const total = (axis === 'col' ? rect.width : rect.height) - GUTTER_PX;

    let pending = null;
    let rafId = null;

    const flush = () => {
      rafId = null;
      if (pending == null) return;
      const ratio = pending;
      pending = null;
      if (axis === 'col') {
        grid.style.gridTemplateColumns = `${ratio}fr ${GUTTER_PX}px ${1 - ratio}fr`;
      } else {
        grid.style.gridTemplateRows = `${ratio}fr ${GUTTER_PX}px ${1 - ratio}fr`;
      }
      el.dataset.pendingRatio = String(ratio);
    };

    const onMove = (m) => {
      const offset = axis === 'col' ? m.clientX - rect.left : m.clientY - rect.top;
      pending = clamp(offset / total);
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-' + axis);
      if (rafId != null) { cancelAnimationFrame(rafId); flush(); }
      const ratio = Number(el.dataset.pendingRatio);
      if (Number.isFinite(ratio)) {
        const next = { ...splits };
        if (axis === 'col') next.col = ratio;
        else next.row = ratio;
        onChange?.(next);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return el;
}

function clamp(n) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, n));
}

import { compareTable, type CompareCell, type CompareWinner, type ComparePageDef } from '../../lib/comparePages';

const svg = (size: number, body: string, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const CHECK_PATH = '<path d="M20 6 9 17l-5-5"/>';

/** Lucide paths; the site Icon set has no rss, tag or x. */
export const GROUP_ICONS: Record<string, string> = {
  Downloading: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'Watching and library': '<polygon points="6 3 20 12 6 21 6 3"/>',
  Channels: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  'Price, license and platforms':
    '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
};
const FALLBACK_ICON = '<circle cx="12" cy="12" r="3"/>';

export const DOWNLOAD_ICON = svg(16, GROUP_ICONS.Downloading, 1.75);
export const EXTERNAL_ICON = (size = 16) => svg(size, '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 2);
const CIRCLE = '<circle cx="12" cy="12" r="10"/>';
const MINUS_ICON = (size: number) => svg(size, CIRCLE + '<path d="M8 12h8"/>', 1.75);
const EQUALS_ICON = (size: number) => svg(size, CIRCLE + '<path d="M8 10h8"/><path d="M8 14h8"/>', 1.75);
const X_CIRCLE_ICON = (size: number) => svg(size, CIRCLE + '<path d="m15 9-6 6"/><path d="m9 9 6 6"/>', 1.75);
export const groupIcon = (label: string, size = 18) => svg(size, GROUP_ICONS[label] ?? FALLBACK_ICON, 1.75);
export const winBadge = (side: 'ruforge' | 'them') => `<span class="cmp-win cmp-win--${side}" aria-label="Better here">${svg(12, CHECK_PATH, 3)}</span>`;

export const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Booleans and short values read the same everywhere: "Yes" or "No" when there is no note. */
export function cellText(cell: CompareCell): string {
  if (cell.note) return cell.note;
  return cell.mark === 'no' ? 'No' : 'Yes';
}

/** Shared by desktop cells and mobile lines: a fixed icon slot, then the text. Only rows with a winner get good/bad icons. */
export function cellInner(cell: CompareCell, side: 'ruforge' | 'them', winner: CompareWinner): string {
  const won = winner === side;
  const sideCls = side === 'ruforge' ? ' cmp-side-ruforge' : '';
  const lead = won
    ? winBadge(side)
    : winner === null
      ? `<span class="cmp-off${sideCls}" role="img" aria-label="Different, neither better">${EQUALS_ICON(18)}</span>`
      : cell.mark === 'no'
        ? `<span class="cmp-off${sideCls}" role="img" aria-label="Not available">${X_CIRCLE_ICON(18)}</span>`
        : `<span class="cmp-off${sideCls}" role="img" aria-label="Worse here">${MINUS_ICON(18)}</span>`;
  const on = won;
  const even = winner === null;
  return `${lead}<span class="${on ? 'cmp-val cmp-val--on' : even ? 'cmp-val cmp-val--even' : 'cmp-val'}${sideCls}">${esc(cellText(cell))}</span>`;
}

function headerHtml(logo: string, name: string): string {
  return `<span class="cmp-th"><span class="cmp-th__slot"><img src="${logo}" width="24" height="24" alt="" draggable="false" /></span><span class="cmp-th__name">${esc(name)}</span></span>`;
}

export function buildCompareTable(page: ComparePageDef, logos: { ruforge: string; them: string }) {
  const headers = ['', 'RuForge', page.name];
  const appCells = [headerHtml(logos.ruforge, 'RuForge'), headerHtml(logos.them, page.name)];
  const rows: (string[] | { group: string; cells?: string[] })[] = [];
  compareTable(page).forEach((group, i) => {
    rows.push({
      group: `<span class="cmp-group">${groupIcon(group.label)}${esc(group.label)}</span>`,
      // The first band doubles as the column header so the app names need no row of their own.
      ...(i === 0 ? { cells: appCells } : {}),
    });
    for (const { row, winner } of group.rows) {
      rows.push([
        esc(row.feature),
        `<span class="cmp-cell">${cellInner(row.ruforge, 'ruforge', winner)}</span>`,
        `<span class="cmp-cell">${cellInner(row.them, 'them', winner)}</span>`,
      ]);
    }
  });
  return { headers, rows };
}

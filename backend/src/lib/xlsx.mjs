// Streaming xlsx reader (ABS allocation files are 20-35 MB). Yields rows as arrays of cell values.
import ExcelJS from 'exceljs';

export async function* xlsxRows(file, { sheet = 1 } = {}) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit' });
  let idx = 0;
  for await (const ws of wb) {
    idx += 1;
    if (typeof sheet === 'number' ? idx !== sheet : (ws.name !== sheet)) { for await (const _ of ws) { /* drain */ } continue; }
    for await (const row of ws) {
      const vals = row.values.slice(1).map((v) => (v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && 'richText' in v ? v.richText.map((t) => t.text).join('') : v));
      yield vals;
    }
    return;
  }
}

/** List sheet names (loads only the workbook index). */
export async function xlsxSheetNames(file) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { entries: 'emit', worksheets: 'emit' });
  const names = [];
  for await (const ws of wb) { names.push(ws.name); for await (const _ of ws) break; }
  return names;
}
export const cell = (v) => (v === null || v === undefined ? null : typeof v === 'string' ? v.trim() : v);
export const numOrNull = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,$\s]/g, '')); return Number.isFinite(n) ? n : null; };

// Builds docs/xlsx/jobs-YYYY-MM-DD.xlsx — one worksheet per source.

import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { SOURCES, XLSX_DIR, loadDay } from './store.mjs';

const COLUMNS = [
  { header: 'Title', key: 'title', width: 48 },
  { header: 'Organization', key: 'org', width: 34 },
  { header: 'Location', key: 'location', width: 28 },
  { header: 'Job Type', key: 'jobType', width: 16 },
  { header: 'Salary', key: 'salary', width: 24 },
  { header: 'Category', key: 'category', width: 30 },
  { header: 'Link', key: 'url', width: 60 },
];

export async function writeXlsxForDate(date) {
  const day = loadDay(date);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const [key, label] of Object.entries(SOURCES)) {
    const ws = wb.addWorksheet(label);
    ws.columns = COLUMNS;
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: 'A1', to: 'G1' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const p of day.postings.filter((p) => p.source === key)) {
      const row = ws.addRow({ ...p });
      const cell = row.getCell('url');
      cell.value = { text: p.url, hyperlink: p.url };
      cell.font = { color: { argb: 'FF1155CC' }, underline: true };
    }
  }

  fs.mkdirSync(XLSX_DIR, { recursive: true });
  const file = path.join(XLSX_DIR, `jobs-${date}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

import * as XLSX from 'xlsx';
import { parseCsv } from '@/lib/csv';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

function sheetToRows(workbook: XLSX.WorkBook): ParsedSpreadsheet {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (raw.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const headers = Object.keys(raw[0] ?? {}).map((h) => h.trim());
  const rows = raw.map((row) => {
    const out: Record<string, string> = {};
    for (const header of headers) {
      const val = row[header];
      out[header] = val == null ? '' : String(val).trim();
    }
    return out;
  }).filter((row) => Object.values(row).some((v) => v.length > 0));

  return { headers, rows, rowCount: rows.length };
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return { headers: [], rows: [], rowCount: 0 };
    }
    const headers = Object.keys(rows[0] ?? {});
    return { headers, rows, rowCount: rows.length };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    return sheetToRows(workbook);
  }

  throw new Error('Only .csv, .xlsx, and .xls files are supported.');
}

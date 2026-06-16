// utils/excel-helpers.ts (igual que te dejé)
import * as XLSX from 'xlsx';
export type RowObj = Record<string, any>;

export function readExcelAsJson(file: File): Promise<RowObj[]> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e: any) => {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }));
    };
    r.onerror = reject;
    r.readAsBinaryString(file);
  });
}

export function trimAll<T extends RowObj>(row: T): T {
  const out: RowObj = {};
  for (const k of Object.keys(row)) out[k] = typeof row[k] === 'string' ? row[k].trim() : row[k];
  return out as T;
}

export function requireFields(row: RowObj, fields: string[]): string[] {
  const missing: string[] = [];
  for (const f of fields) if (!String(row[f] ?? '').trim()) missing.push(f);
  return missing;
}

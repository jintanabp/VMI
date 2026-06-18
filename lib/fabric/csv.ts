import fs from "fs";

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseCsvLine(lines[0], sep);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], sep);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function readCsvFile(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = fs.readFileSync(filePath, "utf-8");
  return parseCsv(text);
}

export function countCsvRows(filePath: string): number {
  const { rows } = readCsvFile(filePath);
  return rows.length;
}

export function validateCsvColumns(
  filePath: string,
  required: string[],
  minRows: number
): { rowCount: number; missing: string[] } {
  const { headers, rows } = readCsvFile(filePath);
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = required.filter((c) => !present.has(c.trim().toLowerCase()));
  const rowCount = rows.length;

  if (minRows > 0 && rowCount < minRows) {
    missing.push(`too_few_rows (got ${rowCount}, need ≥${minRows})`);
  }

  return { rowCount, missing };
}

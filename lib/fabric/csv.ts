import fs from "fs";

/** \u0E27\u0E19 line \u0E17\u0E35\u0E25\u0E30\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E41\u0E1A\u0E1A single-pass (\u0E44\u0E21\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07 array \u0E02\u0E2D\u0E07\u0E17\u0E38\u0E01\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14 + \u0E44\u0E21\u0E48 copy filter \u0E0B\u0E49\u0E33)
 *  \u0E1E\u0E24\u0E15\u0E34\u0E01\u0E23\u0E23\u0E21\u0E40\u0E14\u0E34\u0E21: \u0E41\u0E1A\u0E48\u0E07\u0E14\u0E49\u0E27\u0E22 \n/\r, \u0E02\u0E49\u0E32\u0E21\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E27\u0E48\u0E32\u0E07, \u0E44\u0E21\u0E48\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A newline \u0E43\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E2B\u0E21\u0E32\u0E22\u0E04\u0E33\u0E1E\u0E39\u0E14 */
function forEachCsvLine(text: string, onLine: (line: string) => void): void {
  const len = text.length;
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0; // \u0E02\u0E49\u0E32\u0E21 BOM
  let lineStart = start;
  for (let i = start; i <= len; i++) {
    const isBreak = i === len || text[i] === "\n" || text[i] === "\r";
    if (!isBreak) continue;
    if (i > lineStart) onLine(text.slice(lineStart, i));
    lineStart = i + 1;
  }
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let headers: string[] = [];
  let sep = ",";
  const rows: Record<string, string>[] = [];

  forEachCsvLine(text, (line) => {
    if (headers.length === 0) {
      sep = line.includes("\t") ? "\t" : ",";
      headers = parseCsvLine(line, sep);
      return;
    }
    const values = parseCsvLine(line, sep);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = (values[h] ?? "").trim();
    }
    rows.push(row);
  });

  return { headers, rows };
}

/** \u0E2D\u0E48\u0E32\u0E19 CSV \u0E41\u0E1A\u0E1A stream: \u0E40\u0E23\u0E35\u0E22\u0E01 onRow \u0E15\u0E48\u0E2D\u0E41\u0E16\u0E27\u0E42\u0E14\u0E22\u0E44\u0E21\u0E48\u0E40\u0E01\u0E47\u0E1A array \u0E02\u0E2D\u0E07\u0E17\u0E38\u0E01\u0E41\u0E16\u0E27
 *  \u0E04\u0E35\u0E22\u0E4C\u0E02\u0E2D\u0E07 record \u0E16\u0E39\u0E01 lower-case + trim \u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27 (\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07 normKeys \u0E0B\u0E49\u0E33)
 *  \u0E40\u0E2B\u0E21\u0E32\u0E30\u0E01\u0E31\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E2B\u0E0D\u0E48 (\u0E40\u0E0A\u0E48\u0E19 sku_master 68MB) \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E25\u0E14 RAM/GC */
export function streamCsvFile(
  filePath: string,
  onRow: (row: Record<string, string>) => void
): { headers: string[]; rowCount: number } {
  const text = fs.readFileSync(filePath, "utf-8");
  let headers: string[] = [];
  let sep = ",";
  let rowCount = 0;

  forEachCsvLine(text, (line) => {
    if (headers.length === 0) {
      sep = line.includes("\t") ? "\t" : ",";
      headers = parseCsvLine(line, sep).map((h) => h.toLowerCase().trim());
      return;
    }
    const values = parseCsvLine(line, sep);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = (values[h] ?? "").trim();
    }
    onRow(row);
    rowCount++;
  });

  return { headers, rowCount };
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

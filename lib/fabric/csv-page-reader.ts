import fs from "fs";
import { StringDecoder } from "string_decoder";
import { forEachCsvRecordWith, parseCsvRecord, sniffSeparator } from "./csv";

/**
 * อ่าน CSV ทีละหน้าโดยไม่โหลดทั้งไฟล์
 *
 * ชั้น lib/fabric/* ที่มีอยู่อ่านด้วย fs.readFileSync ทั้งไฟล์เสมอ ซึ่งพอกับ loader ที่
 * ต้องการทั้งไฟล์อยู่แล้ว แต่ใช้กับหน้าแอดมิน "ดูข้อมูลดิบ" ไม่ได้ — item_barcode_map_v2.csv
 * 69MB กลายเป็น string ~140MB ต่อหนึ่ง request และเครื่องนี้ไม่ได้ตั้ง max-old-space-size ไว้เลย
 *
 * แนวทาง: สแกนไฟล์ระดับ byte รอบเดียวเพื่อทำ "ดัชนีจุดจอด" (anchor ทุก ๆ 500 แถว)
 * แล้วเวลาขอหน้าไหนก็กระโดดไปอ่านเฉพาะช่วง byte นั้น · ดัชนี cache ตาม mtime+size
 * ไฟล์ 69MB สแกนครั้งแรก ~0.3 วิ หลังจากนั้นเปิดหน้าไหนก็ทันที
 *
 * ทำไมสแกน byte ได้โดยไม่ต้อง decode ก่อน: UTF-8 เป็น self-synchronizing —
 * ไบต์ของ `"` `,` `\t` `\n` `\r` (0x22 0x2C 0x09 0x0A 0x0D) ไม่มีทางโผล่เป็น
 * continuation byte (0x80-0xBF) ของอักษรตัวอื่น ข้อความไทยจึงผ่านไปได้โดยไม่ถูกแตะ
 *
 * นิยามคำพูดต้องตรงกับ lib/fabric/csv.ts เป๊ะ ไม่งั้นขอบเขต record ของสองที่จะไม่ตรงกัน
 * แล้วเลขแถวที่หน้าเว็บโชว์จะไม่ใช่เลขเดียวกับที่ระบบใช้จริง
 */

export const MAX_CELL_CHARS = 2000;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;
export const MAX_PAGE_BYTES = 8 * 1024 * 1024;
export const INDEX_STRIDE = 500;
export const SEARCH_TIME_BUDGET_MS = 1200;
export const HEAD_BYTES = 64 * 1024;

const SCAN_CHUNK = 1 << 20;
const INDEX_CACHE_LIMIT = 32;

const QUOTE = 0x22;
const LF = 0x0a;
const CR = 0x0d;

export interface CsvIndex {
  filePath: string;
  /** ลายเซ็นไฟล์ — เปลี่ยนเมื่อไหร่แปลว่าดัชนีเก่าใช้ไม่ได้แล้ว */
  version: string;
  mtimeMs: number;
  size: number;
  bomBytes: 0 | 3;
  separator: string;
  /** หัวตารางดิบ ไม่ lower-case ไม่ trim ไม่ตัดตัวซ้ำ */
  headers: string[];
  firstDataOffset: number;
  /** จำนวน record ข้อมูล (ไม่นับหัวตาราง) */
  rowCount: number;
  stride: number;
  /** anchors[k] = byte offset ของแถวข้อมูลลำดับ k*stride */
  anchors: number[];
  maxColumns: number;
  /** จำนวนคอลัมน์ที่น้อยที่สุดในบรรดาแถวข้อมูล (0 = ไม่มีแถวข้อมูล) */
  minColumns: number;
  /** มีแถวที่จำนวนคอลัมน์ไม่เท่าหัวตาราง */
  ragged: boolean;
  /** มี newline อยู่ในค่าที่อยู่ในเครื่องหมายคำพูด */
  hasEmbeddedNewlines: boolean;
  scanMs: number;
}

/** ดัชนีที่ส่งออก API — ตัด anchors ทิ้ง ไม่มีประโยชน์กับ client และทำ payload บวม */
export type CsvIndexSummary = Omit<CsvIndex, "anchors">;

export interface CsvRow {
  /** ลำดับแถวข้อมูลจริงในไฟล์ เริ่มที่ 0 */
  i: number;
  cells: string[];
}

export interface CsvSearchInfo {
  q: string;
  column: number | null;
  /** false = ยังไม่ได้ดูทั้งไฟล์ — ดูที่ reason ว่าหยุดเพราะอะไร */
  complete: boolean;
  /**
   * ทำไมถึงหยุด — ต้องแยกให้ออก ไม่งั้นข้อความบนหน้าจอจะโทษผิดสาเหตุ
   * limit = เจอครบจำนวนที่แสดงได้แล้ว (ยังมีต่อ) · timeout = ใช้เวลาเกินงบ
   */
  reason: "complete" | "limit" | "timeout";
  scannedRows: number;
}

export interface CsvPage {
  index: CsvIndexSummary;
  rows: CsvRow[];
  offset: number;
  limit: number;
  truncatedCells: number;
  bytesRead: number;
  search: CsvSearchInfo | null;
}

export class CsvFileChangedError extends Error {
  constructor(readonly version: string) {
    super("ไฟล์ถูกเขียนทับระหว่างอ่าน");
    this.name = "CsvFileChangedError";
  }
}

const indexCache = new Map<string, CsvIndex>();

function fileVersion(mtimeMs: number, size: number): string {
  return `${mtimeMs}-${size}`;
}

function firstBreakIndex(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" || text[i] === "\r") return i;
  }
  return -1;
}

function summarize(index: CsvIndex): CsvIndexSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ตัด anchors ออกจาก payload
  const { anchors, ...rest } = index;
  return rest;
}

function clampCell(cell: string, counter: { n: number }): string {
  if (cell.length <= MAX_CELL_CHARS) return cell;
  counter.n++;
  return `${cell.slice(0, MAX_CELL_CHARS)}…`;
}

/**
 * สแกนทั้งไฟล์รอบเดียวเพื่อสร้างดัชนี
 *
 * สถานะที่ต้องข้ามก้อน (chunk) ได้: pendingQuote = ไบต์สุดท้ายของก้อนเป็น `"` ตอนอยู่ใน
 * คำพูด ต้องรอไบต์แรกของก้อนถัดไปถึงจะรู้ว่าปิดค่า/เป็น "" /เป็นตัวอักษร ·
 * pendingCR = ก้อนจบด้วย \r ถ้าก้อนถัดไปขึ้นต้นด้วย \n ต้องนับเป็น CRLF คู่เดียว
 */
function buildIndex(filePath: string, stride: number): CsvIndex {
  const t0 = Date.now();
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const fd = fs.openSync(filePath, "r");

  try {
    let bomBytes: 0 | 3 = 0;
    if (size >= 3) {
      const probe = Buffer.allocUnsafe(3);
      fs.readSync(fd, probe, 0, 3, 0);
      if (probe[0] === 0xef && probe[1] === 0xbb && probe[2] === 0xbf) bomBytes = 3;
    }

    const headLen = Math.min(HEAD_BYTES, Math.max(0, size - bomBytes));
    const headBuf = Buffer.allocUnsafe(headLen);
    if (headLen > 0) fs.readSync(fd, headBuf, 0, headLen, bomBytes);
    const headText = headBuf.toString("utf8");
    const breakAt = firstBreakIndex(headText);
    const separator = sniffSeparator(breakAt === -1 ? headText : headText.slice(0, breakAt));
    const sepByte = separator.charCodeAt(0);

    const buf = Buffer.allocUnsafe(SCAN_CHUNK);
    const anchors: number[] = [];
    let filePos: number = bomBytes;
    let recordStart: number = bomBytes;
    let inQuotes = false;
    let pendingQuote = false;
    let pendingCR = false;
    let recordIndex = 0;
    let sepCount = 0;
    let headerCols = 0;
    let headerEnd = -1;
    let maxColumns = 0;
    let minColumns = 0;
    let ragged = false;
    let hasEmbeddedNewlines = false;
    let rowCount = 0;

    const finishRecord = (endAbs: number, nextStartAbs: number) => {
      if (endAbs > recordStart) {
        const cols = sepCount + 1;
        if (recordIndex === 0) {
          headerCols = cols;
          headerEnd = endAbs;
        } else {
          if (cols !== headerCols) ragged = true;
          if (cols > maxColumns) maxColumns = cols;
          if (minColumns === 0 || cols < minColumns) minColumns = cols;
          if (rowCount % stride === 0) anchors.push(recordStart);
          rowCount++;
        }
        recordIndex++;
      }
      recordStart = nextStartAbs;
      sepCount = 0;
    };

    while (filePos < size) {
      const want = Math.min(SCAN_CHUNK, size - filePos);
      const got = fs.readSync(fd, buf, 0, want, filePos);
      if (got <= 0) break;

      let i = 0;
      if (pendingCR) {
        pendingCR = false;
        if (buf[0] === LF) {
          recordStart = filePos + 1;
          i = 1;
        }
      } else if (pendingQuote) {
        pendingQuote = false;
        const b = buf[0];
        if (b === QUOTE) {
          i = 1; // "" = quote ตัวอักษร ยังอยู่ในคำพูด
        } else if (b === sepByte || b === LF || b === CR) {
          inQuotes = false; // ปิดค่าจริง แล้วปล่อยให้ลูปข้างล่างจัดการไบต์นี้ตามปกติ
        }
        // นอกนั้น = quote เดี่ยวกลางค่า ยังอยู่ในคำพูด
      }

      for (; i < got; i++) {
        const b = buf[i];
        const abs = filePos + i;

        if (b === QUOTE) {
          if (!inQuotes) {
            inQuotes = true;
            continue;
          }
          if (i + 1 < got) {
            const n = buf[i + 1];
            if (n === QUOTE) {
              i++;
            } else if (n === sepByte || n === LF || n === CR) {
              inQuotes = false;
            }
            continue;
          }
          if (abs + 1 >= size) {
            inQuotes = false; // จบไฟล์ = ปิดค่า
          } else {
            pendingQuote = true;
          }
          continue;
        }

        if (inQuotes) {
          if (b === LF || b === CR) hasEmbeddedNewlines = true;
          continue;
        }

        if (b === sepByte) {
          sepCount++;
          continue;
        }

        if (b === LF) {
          finishRecord(abs, abs + 1);
          continue;
        }

        if (b === CR) {
          if (i + 1 < got) {
            if (buf[i + 1] === LF) {
              finishRecord(abs, abs + 2);
              i++;
            } else {
              finishRecord(abs, abs + 1);
            }
          } else {
            finishRecord(abs, abs + 1);
            if (abs + 1 < size) pendingCR = true;
          }
        }
      }

      filePos += got;
    }

    if (size > recordStart) finishRecord(size, size);

    let headers: string[] = [];
    if (headerEnd > bomBytes) {
      const len = headerEnd - bomBytes;
      const hb = Buffer.allocUnsafe(len);
      fs.readSync(fd, hb, 0, len, bomBytes);
      headers = parseCsvRecord(hb.toString("utf8"), separator);
    }

    return {
      filePath,
      version: fileVersion(stat.mtimeMs, size),
      mtimeMs: stat.mtimeMs,
      size,
      bomBytes,
      separator,
      headers,
      firstDataOffset: anchors[0] ?? size,
      rowCount,
      stride,
      anchors,
      maxColumns: Math.max(maxColumns, headers.length),
      minColumns,
      ragged,
      hasEmbeddedNewlines,
      scanMs: Date.now() - t0,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function rememberIndex(index: CsvIndex): CsvIndex {
  // key เดียวต่อไฟล์ — sync รอบใหม่ต้อง "แทนที่" ของเก่า ไม่ใช่สะสมทีละ mtime
  indexCache.set(index.filePath, index);
  while (indexCache.size > INDEX_CACHE_LIMIT) {
    const oldest = indexCache.keys().next().value;
    if (oldest === undefined) break;
    indexCache.delete(oldest);
  }
  return index;
}

export function getCsvIndex(
  filePath: string,
  opts?: { stride?: number }
): CsvIndex {
  const stride = Math.max(1, opts?.stride ?? INDEX_STRIDE);
  const stat = fs.statSync(filePath);
  const version = fileVersion(stat.mtimeMs, stat.size);
  const hit = indexCache.get(filePath);
  if (hit && hit.version === version && hit.stride === stride) return hit;
  return rememberIndex(buildIndex(filePath, stride));
}

/** ดัชนีที่ทำไว้แล้วเท่านั้น — ไม่สแกนใหม่ ใช้ตอนทำหน้ารายการที่ต้องเร็ว */
export function peekCsvIndex(filePath: string): CsvIndex | null {
  const hit = indexCache.get(filePath);
  if (!hit) return null;
  try {
    const stat = fs.statSync(filePath);
    if (hit.version !== fileVersion(stat.mtimeMs, stat.size)) return null;
    return hit;
  } catch {
    return null;
  }
}

/**
 * นับจำนวนแถว — ใช้แทน countCsvRows() ที่ parse ทั้งไฟล์เป็น object เพื่อเอาแค่ .length
 */
export function countCsvRecords(filePath: string): number {
  return getCsvIndex(filePath).rowCount;
}

/** หัวตาราง + ตัวอย่างไม่กี่แถว โดยอ่านแค่ต้นไฟล์ ไม่สแกนทั้งไฟล์ */
export function readCsvHead(
  filePath: string,
  maxBytes = HEAD_BYTES
): { headers: string[]; separator: string; sampleRows: string[][] } {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  try {
    const len = Math.min(maxBytes, stat.size);
    const buf = Buffer.allocUnsafe(len);
    if (len > 0) fs.readSync(fd, buf, 0, len, 0);
    const text = buf.toString("utf8");
    const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const breakAt = firstBreakIndex(text.slice(start));
    const separator = sniffSeparator(
      breakAt === -1 ? text.slice(start) : text.slice(start, start + breakAt)
    );

    const recs: string[] = [];
    forEachCsvRecordWith(text, separator, start, (r) => recs.push(r));
    // record สุดท้ายอาจถูกตัดกลางคันเพราะอ่านมาแค่ต้นไฟล์ — ทิ้งไว้ก่อน
    if (recs.length > 1 && len < stat.size) recs.pop();

    const headers = recs.length > 0 ? parseCsvRecord(recs[0], separator) : [];
    const sampleRows = recs.slice(1, 6).map((r) => parseCsvRecord(r, separator));
    return { headers, separator, sampleRows };
  } finally {
    fs.closeSync(fd);
  }
}

interface SliceResult {
  rows: CsvRow[];
  bytesRead: number;
  truncatedCells: number;
}

function readSlice(
  index: CsvIndex,
  offset: number,
  limit: number
): SliceResult {
  const counter = { n: 0 };
  if (offset >= index.rowCount || limit <= 0) {
    return { rows: [], bytesRead: 0, truncatedCells: 0 };
  }

  const k = Math.floor(offset / index.stride);
  const startByte = index.anchors[k] ?? index.firstDataOffset;
  const skip = offset - k * index.stride;

  const endAnchorIdx = Math.ceil((offset + limit) / index.stride);
  let endByte =
    endAnchorIdx < index.anchors.length ? index.anchors[endAnchorIdx] : index.size;
  let clamped = false;
  if (endByte - startByte > MAX_PAGE_BYTES) {
    endByte = startByte + MAX_PAGE_BYTES;
    clamped = true;
  }

  const len = Math.max(0, endByte - startByte);
  const fd = fs.openSync(index.filePath, "r");
  let text: string;
  try {
    const buf = Buffer.allocUnsafe(len);
    if (len > 0) fs.readSync(fd, buf, 0, len, startByte);

    // ตรวจจาก descriptor ที่เปิดอยู่ ไม่ใช่จาก path — รอบ sync เขียนทับไฟล์เดิม
    // (onelake-refresh เขียนด้วย writeFileSync) การอ่านคร่อมรอบ sync จึงเกิดได้จริง
    const now = fs.fstatSync(fd);
    if (fileVersion(now.mtimeMs, now.size) !== index.version) {
      throw new CsvFileChangedError(fileVersion(now.mtimeMs, now.size));
    }
    text = buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }

  const records: string[] = [];
  forEachCsvRecordWith(text, index.separator, 0, (r) => {
    records.push(r);
  });
  if (clamped && records.length > 0) records.pop(); // ตัวสุดท้ายอาจถูกตัดกลางคัน

  const rows: CsvRow[] = [];
  for (let n = skip; n < records.length && rows.length < limit; n++) {
    rows.push({
      i: offset + (n - skip),
      cells: parseCsvRecord(records[n], index.separator).map((c) =>
        clampCell(c, counter)
      ),
    });
  }

  return { rows, bytesRead: len, truncatedCells: counter.n };
}

/**
 * อ่านหนึ่งหน้า · ถ้าไฟล์เพิ่งถูก sync ทับระหว่างอ่าน จะทำดัชนีใหม่แล้วลองอีกครั้งเดียว
 */
export function readCsvPage(
  filePath: string,
  opts: { offset: number; limit: number; stride?: number }
): CsvPage {
  const limit = Math.min(Math.max(1, opts.limit), MAX_PAGE_SIZE);
  const offset = Math.max(0, opts.offset);

  let index = getCsvIndex(filePath, { stride: opts.stride });
  let sliced: SliceResult;
  try {
    sliced = readSlice(index, offset, limit);
  } catch (err) {
    if (!(err instanceof CsvFileChangedError)) throw err;
    indexCache.delete(filePath);
    index = getCsvIndex(filePath, { stride: opts.stride });
    sliced = readSlice(index, offset, limit);
  }

  return {
    index: summarize(index),
    rows: sliced.rows,
    offset,
    limit,
    truncatedCells: sliced.truncatedCells,
    bytesRead: sliced.bytesRead,
    search: null,
  };
}

/**
 * ค้นทั้งไฟล์แบบมีเพดานเวลา
 *
 * เทียบกับ "ข้อความดิบของ record" ก่อน แล้วค่อยแยกเซลล์เฉพาะแถวที่เข้าเงื่อนไข —
 * แยกเซลล์ทุกแถวของไฟล์ 69MB ไม่ทันใน request เดียว
 *
 * ครบเวลาแล้วยังไม่จบไฟล์จะคืน complete=false — ผู้เรียก **ต้อง** เอาไปบอกผู้ใช้
 * ไม่งั้น "ค้นไม่ครบ" จะถูกอ่านเป็น "ไม่มีข้อมูล" ซึ่งอันตรายกว่าไม่มีช่องค้นหาเลย
 */
export function searchCsv(
  filePath: string,
  opts: {
    q: string;
    limit: number;
    column?: number | null;
    budgetMs?: number;
    stride?: number;
  }
): CsvPage {
  const index = getCsvIndex(filePath, { stride: opts.stride });
  const limit = Math.min(Math.max(1, opts.limit), MAX_PAGE_SIZE);
  const budgetMs = opts.budgetMs ?? SEARCH_TIME_BUDGET_MS;
  const column = opts.column ?? null;
  const needle = opts.q.toLowerCase();
  const counter = { n: 0 };

  const rows: CsvRow[] = [];
  let scannedRows = 0;
  let timedOut = false;
  let hitLimit = false;
  let bytesRead = 0;

  if (!needle) {
    return {
      index: summarize(index),
      rows,
      offset: 0,
      limit,
      truncatedCells: 0,
      bytesRead: 0,
      search: { q: opts.q, column, complete: true, reason: "complete", scannedRows: 0 },
    };
  }

  const t0 = Date.now();
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(SCAN_CHUNK);
    const decoder = new StringDecoder("utf8");
    let filePos = index.firstDataOffset;
    let carry = "";

    outer: while (filePos < index.size) {
      const want = Math.min(SCAN_CHUNK, index.size - filePos);
      const got = fs.readSync(fd, buf, 0, want, filePos);
      if (got <= 0) break;
      filePos += got;
      bytesRead += got;

      const chunk = carry + decoder.write(buf.subarray(0, got));
      const records: string[] = [];
      forEachCsvRecordWith(chunk, index.separator, 0, (r) => records.push(r));

      // record สุดท้ายอาจยังไม่จบ — ยกไปต่อกับก้อนหน้า (ยกเว้นก้อนสุดท้ายของไฟล์)
      const atEof = filePos >= index.size;
      carry = atEof ? "" : (records.pop() ?? "");

      for (const record of records) {
        const hit =
          column == null
            ? record.toLowerCase().includes(needle)
            : (parseCsvRecord(record, index.separator)[column] ?? "")
                .toLowerCase()
                .includes(needle);
        if (hit) {
          rows.push({
            i: scannedRows,
            cells: parseCsvRecord(record, index.separator).map((c) =>
              clampCell(c, counter)
            ),
          });
        }
        scannedRows++;
        if (rows.length >= limit) {
          hitLimit = true;
          break outer;
        }
        if ((scannedRows & 63) === 0 && Date.now() - t0 > budgetMs) {
          timedOut = true;
          break outer;
        }
      }
    }

    if (carry && !timedOut && rows.length < limit) {
      const hit =
        column == null
          ? carry.toLowerCase().includes(needle)
          : (parseCsvRecord(carry, index.separator)[column] ?? "")
              .toLowerCase()
              .includes(needle);
      if (hit) {
        rows.push({
          i: scannedRows,
          cells: parseCsvRecord(carry, index.separator).map((c) =>
            clampCell(c, counter)
          ),
        });
      }
      scannedRows++;
    }
  } finally {
    fs.closeSync(fd);
  }

  // ดูไม่ครบไฟล์จริง ๆ เท่านั้นถึงนับว่าไม่ complete — ครบพอดีทั้งไฟล์ไม่ใช่ "ไม่ครบ"
  const sawWholeFile = scannedRows >= index.rowCount;
  const reason: CsvSearchInfo["reason"] = timedOut
    ? "timeout"
    : hitLimit && !sawWholeFile
      ? "limit"
      : "complete";

  return {
    index: summarize(index),
    rows,
    offset: 0,
    limit,
    truncatedCells: counter.n,
    bytesRead,
    search: { q: opts.q, column, complete: reason === "complete", reason, scannedRows },
  };
}

export function __resetCsvIndexCacheForTest(): void {
  indexCache.clear();
}

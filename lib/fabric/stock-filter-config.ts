export type StockFilterMode = "from_db" | "vda";

export interface StockFilterConfig {
  /** รายการ from_db ที่อนุญาต (ว่าง = auto จาก CSV) */
  options: string[];
  /** ค่าเริ่มต้นเมื่อเปิดหน้า stock */
  defaultFromDb: string;
  /** โหมด vda = แสดงเฉพาะ from_db ที่ขึ้นต้นด้วย prefix */
  filterMode: StockFilterMode;
  /** prefix สำหรับโหมด vda (default: vda) */
  vdaPrefix: string;
}

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** อ่านจาก .env — ตั้งค่า filter หน้า stock ได้ */
export function getStockFilterConfig(): StockFilterConfig {
  const modeRaw = (process.env.STOCK_FILTER_MODE ?? "from_db").trim().toLowerCase();
  const filterMode: StockFilterMode = modeRaw === "vda" ? "vda" : "from_db";

  return {
    options: parseList(process.env.STOCK_FROM_DB_OPTIONS),
    defaultFromDb: (process.env.STOCK_FROM_DB_DEFAULT ?? process.env.STOCK_COVER_FROM_DB ?? "").trim(),
    filterMode,
    vdaPrefix: (process.env.STOCK_VDA_PREFIX ?? "vda").trim(),
  };
}

export function resolveActiveFromDb(
  sources: string[],
  requested: string | null | undefined,
  config: StockFilterConfig
): string | null {
  if (sources.length === 0) return null;

  const req = requested?.trim();
  if (req && sources.some((s) => s.toLowerCase() === req.toLowerCase())) {
    return sources.find((s) => s.toLowerCase() === req.toLowerCase()) ?? sources[0];
  }

  if (config.defaultFromDb) {
    const hit = sources.find(
      (s) => s.toLowerCase() === config.defaultFromDb.toLowerCase()
    );
    if (hit) return hit;
  }

  return sources[0];
}

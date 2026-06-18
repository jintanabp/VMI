import { mkdir, writeFile } from "fs/promises";
import path from "path";

interface PoExportItem {
  skuCode: string;
  qty: number;
  unit: string;
}

interface PoExportPayload {
  orderId: string;
  storeCode: string;
  approvedAt: string;
  items: PoExportItem[];
}

export async function exportToPoStub(payload: PoExportPayload): Promise<string> {
  const dir = path.join(process.cwd(), "logs", "po-export");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${payload.orderId}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

import fs from "fs";
import {
  buildVdaAosSpec,
  refreshOne,
  type DatasetRefreshResult,
  type RefreshOptions,
} from "./onelake-refresh";
import { getVdaKeys, reloadVdaAosBillRegistry } from "./vda-aos-bill";
import { getVdaAosCsvPath } from "./paths";

export async function syncVdaAosBills(
  options: RefreshOptions = {},
  only?: ReadonlySet<string>
): Promise<{ any: boolean; results: DatasetRefreshResult[] }> {
  let any = false;
  const results: DatasetRefreshResult[] = [];

  for (const vda of getVdaKeys()) {
    const spec = buildVdaAosSpec(vda, getVdaAosCsvPath(vda));
    if (!spec) continue;
    if (only && !only.has(spec.name)) continue;

    // ต้องพยายามโหลดใหม่ทุกครั้ง — เดิมข้ามทั้งดุ้นเมื่อไฟล์มีอยู่แล้ว
    // ทำให้ vda*_aos_bill.csv ไม่เคยอัปเดตหลังดึงครั้งแรกเลย
    const res = await refreshOne(spec, options);
    results.push(res);
    if (res.ok) {
      any = true;
      continue;
    }
    // โหลดไม่สำเร็จแต่ยังมีไฟล์เดิมใช้ได้ → ไม่ถือว่าทั้งรอบล้มเหลว
    if (fs.existsSync(spec.localPath) && fs.statSync(spec.localPath).size >= 50) {
      any = true;
    }
  }

  reloadVdaAosBillRegistry();
  return { any, results };
}

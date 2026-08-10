import fs from "fs";
import {
  buildVdaProductSpec,
  refreshOne,
  type DatasetRefreshResult,
  type RefreshOptions,
} from "./onelake-refresh";
import { getVdaKeys } from "./vda-aos-bill";
import { getVdaProductCsvPath } from "./paths";
import { reloadVdaProductValueRegistry } from "./vda-product-value";

/**
 * ดึง vda{N}_product_product.csv — มูลค่าสต็อกจริงต่อ VDA
 * ล้มทีละไฟล์ได้ ถ้าไฟล์เดิมยังอยู่ก็ใช้ต่อได้
 */
export async function syncVdaProductValues(
  options: RefreshOptions = {},
  only?: ReadonlySet<string>
): Promise<{ any: boolean; results: DatasetRefreshResult[] }> {
  let any = false;
  const results: DatasetRefreshResult[] = [];

  for (const vda of getVdaKeys()) {
    const spec = buildVdaProductSpec(vda, getVdaProductCsvPath(vda));
    if (!spec) continue;
    if (only && !only.has(spec.name)) continue;

    const res = await refreshOne(spec, options);
    results.push(res);
    if (res.ok) {
      any = true;
      continue;
    }
    if (fs.existsSync(spec.localPath) && fs.statSync(spec.localPath).size >= 50) {
      any = true;
    }
  }

  reloadVdaProductValueRegistry();
  return { any, results };
}

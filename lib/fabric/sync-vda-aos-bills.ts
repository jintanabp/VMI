import fs from "fs";
import {
  buildVdaAosSpec,
  refreshOne,
  type RefreshOptions,
} from "./onelake-refresh";
import { getVdaKeys, reloadVdaAosBillRegistry } from "./vda-aos-bill";
import { getVdaAosCsvPath } from "./paths";

export async function syncVdaAosBills(
  options: RefreshOptions = {}
): Promise<boolean> {
  let any = false;
  for (const vda of getVdaKeys()) {
    const spec = buildVdaAosSpec(vda, getVdaAosCsvPath(vda));
    if (!spec) continue;
    if (!fs.existsSync(spec.localPath) || fs.statSync(spec.localPath).size < 50) {
      const ok = await refreshOne(spec, options);
      if (ok) any = true;
    } else {
      any = true;
    }
  }
  reloadVdaAosBillRegistry();
  return any;
}

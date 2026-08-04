"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { appPath } from "@/lib/paths";
import {
  promoGroupLabel,
  promoGroupShortLabel,
  promoGroupTooltip,
  type PromoGroupNames,
} from "@/lib/promo/promo-group-label";

export const PROMO_GROUP_NAMES_KEY = ["promo-assorted-names"] as const;

const EMPTY: PromoGroupNames = {};

/**
 * ชื่อกลุ่มโปร (ASSORTEDPRODUCTGROUP → DESCRIPTIONASSORTED)
 *
 * ยิงครั้งเดียวต่อ session แล้วทุกหน้าที่โชว์กลุ่มโปรใช้ร่วมกันผ่าน queryKey เดียวกัน
 * ระหว่างที่ยังโหลดไม่เสร็จ label จะเป็นรหัสกลุ่มเดิม — ไม่มีสถานะว่างให้ผู้ใช้เห็น
 */
export function usePromoGroupNames() {
  const { data } = useQuery<PromoGroupNames>({
    queryKey: PROMO_GROUP_NAMES_KEY,
    queryFn: async () => {
      const res = await fetch(appPath("/api/promo/assorted-names"));
      if (!res.ok) throw new Error(`assorted-names ${res.status}`);
      const json = (await res.json()) as { names?: PromoGroupNames };
      return json.names ?? EMPTY;
    },
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const names = data ?? EMPTY;

  const label = useCallback(
    (group: string | null | undefined) => promoGroupLabel(group, names),
    [names]
  );
  /** ชื่อย่อสำหรับที่แคบ — คู่กับ tooltip เสมอ ผู้ใช้จะได้เข้าถึงชื่อเต็มได้ */
  const shortLabel = useCallback(
    (group: string | null | undefined, maxLen?: number) =>
      promoGroupShortLabel(group, names, maxLen),
    [names]
  );
  const tooltip = useCallback(
    (group: string | null | undefined) => promoGroupTooltip(group, names),
    [names]
  );

  return { names, label, shortLabel, tooltip };
}

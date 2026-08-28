"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { appPath } from "@/lib/paths";
import { useSalesSession } from "@/hooks/use-sales-session";
import { apiFetch } from "@/lib/api-fetch";

export interface VdaAccessInfo {
  hasVdaAccess: boolean;
  vdas: string[];
  allPersonVdas?: string[];
  hasAnyPersonVda?: boolean;
  salesmanCode?: string;
  salesmanName?: string;
  isAdmin?: boolean;
  vdaRegistryLoaded?: boolean;
  multipleCodes?: boolean;
  codes?: Array<{
    code: string;
    name: string;
    vdas: string[];
    hasVdaAccess: boolean;
  }>;
}

/**
 * รายชื่อ VDA ที่ผู้ใช้ปัจจุบันเลือกกรองได้
 *
 * admin เห็นทุก VDA จาก /api/vda · เซลล์เห็นเฉพาะที่ตัวเองดูแลจาก /api/sales/vda-access
 * แยกออกมาเป็น hook เพราะหน้าตรวจออเดอร์กับหน้า PO ต้องใช้ชุดเดียวกัน
 * (queryKey เดิมทั้งคู่ react-query จึงแชร์ cache ไม่ยิงซ้ำ)
 */
export function useVdaOptions() {
  const { session } = useSalesSession();
  const isAdmin = session?.role === "admin";

  const { data: vdaAccess } = useQuery<VdaAccessInfo>({
    queryKey: ["sales-vda-access"],
    queryFn: () => apiFetch(appPath("/api/sales/vda-access")).then((r) => r.json()),
    enabled: !!session && !isAdmin,
  });

  const { data: vdaSources = [] } = useQuery<string[]>({
    queryKey: ["vda-sources"],
    queryFn: () =>
      apiFetch(appPath("/api/vda"))
        .then((r) => r.json())
        .then((d) => (Array.isArray(d.sources) ? d.sources : [])),
    enabled: isAdmin,
  });

  const availableVdas = useMemo(() => {
    if (isAdmin) return vdaSources;
    return vdaAccess?.vdas ?? [];
  }, [isAdmin, vdaSources, vdaAccess?.vdas]);

  return {
    isAdmin,
    availableVdas,
    vdaAccess,
    /** false = ยังโหลดสิทธิ์ไม่เสร็จ อย่าเพิ่งยิง query ที่ต้องใช้ scope */
    ready: !!session && (isAdmin || vdaAccess !== undefined),
  };
}

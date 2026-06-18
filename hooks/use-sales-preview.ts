"use client";

import { useEffect, useState } from "react";

interface SalesPreviewInfo {
  asEmail: string;
  asCode: string;
  asName: string;
}

export function useSalesPreview() {
  const [preview, setPreview] = useState<SalesPreviewInfo | null>(null);

  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith("vmi_sales_preview_info="))
      ?.split("=")
      .slice(1)
      .join("=");
    if (!raw) {
      setPreview(null);
      return;
    }
    try {
      setPreview(JSON.parse(decodeURIComponent(raw)) as SalesPreviewInfo);
    } catch {
      setPreview(null);
    }
  }, []);

  return preview;
}

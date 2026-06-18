"use client";

import { useEffect, useState } from "react";
import { ADMIN_PREVIEW_COOKIE } from "@/lib/auth/admin-preview-cookie";

export function useAdminPreview(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${ADMIN_PREVIEW_COOKIE}=`));
    setActive(match?.endsWith("=1") ?? false);
  }, []);

  return active;
}

"use client";

import { useEffect } from "react";

/**
 * ตาข่ายชั้นสุดท้าย — ทำงานเมื่อ root layout เองพัง app/error.tsx จึง render ไม่ได้
 * ต้องมี html/body ของตัวเอง และห้ามพึ่ง provider/ฟอนต์/CSS ของ layout
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VMI] Fatal error:", error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            ระบบขัดข้อง
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#475569",
              maxWidth: "28rem",
            }}
          >
            เกิดข้อผิดพลาดร้ายแรง กรุณาลองใหม่อีกครั้ง
            ถ้ายังไม่หายให้แจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิง
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.75rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#94a3b8",
              }}
            >
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#0d9488",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}

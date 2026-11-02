import type { Metadata } from "next";
import { Noto_Sans_Thai, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { cookies } from "next/headers";
import { MovedNotice } from "@/components/layout/moved-notice";
import { LEGACY_ACCESS_COOKIE, MOVED_TO_URL, legacySiteAllowed } from "@/lib/moved";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { getStoreSession } from "@/lib/auth/store-session";
import { isCreator, isStaffAdmin } from "@/lib/auth/permissions";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "VMI - Vendor Managed Inventory",
  description: "ระบบจัดการสต็อกและสั่งสินค้าสำหรับร้านค้าและเซลล์",
};

/** ระบบย้ายแล้ว → ผู้ดูแลระบบยังเปิดหน้าเดิมได้ (ดูออเดอร์เก่า) คนอื่นเห็นหน้าแจ้งย้าย — ดู lib/moved.ts */
async function showMovedNotice(): Promise<boolean> {
  if (!MOVED_TO_URL) return false;
  // raw = อีเมลจริงของ creator แม้อยู่ในมุมทดสอบ (มุมทดสอบสวมเป็นเซลล์ จะไม่ผ่านด่านนี้)
  const sales = await getRawSalesSession();
  const isAdmin = isCreator(sales) || isStaffAdmin(sales);
  if (isAdmin) return false;
  const hasLegacyCookie = (await cookies()).get(LEGACY_ACCESS_COOKIE)?.value === "1";
  const hasAnySession = sales != null || (hasLegacyCookie && (await getStoreSession()) != null);
  return !legacySiteAllowed({ isAdmin, hasLegacyCookie, hasAnySession });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const moved = await showMovedNotice();
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("vmi-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${notoSansThai.variable} ${inter.variable} antialiased`}>
        {/* ระบบย้ายแล้ว = ทุกหน้าขึ้นปุ่มไปลิงก์ใหม่แทนเนื้อหาเดิม (lib/moved.ts) */}
        {moved && MOVED_TO_URL ? (
          <MovedNotice url={MOVED_TO_URL} />
        ) : (
          <Providers>{children}</Providers>
        )}
      </body>
    </html>
  );
}

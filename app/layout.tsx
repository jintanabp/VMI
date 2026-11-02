import type { Metadata } from "next";
import { Noto_Sans_Thai, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MovedNotice } from "@/components/layout/moved-notice";
import { MOVED_TO_URL } from "@/lib/moved";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        {MOVED_TO_URL ? <MovedNotice url={MOVED_TO_URL} /> : <Providers>{children}</Providers>}
      </body>
    </html>
  );
}

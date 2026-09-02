import { cn } from "@/lib/utils";

/**
 * โครงหน้าฝั่งร้าน — พื้นหลังอย่างเดียว
 *
 * เคยมี prop `customerNav` ที่เรนเดอร์แถบเมนูล่างสำหรับมือถือพร้อมเว้น padding ให้
 * แต่ไม่มีหน้าไหนส่ง `true` เข้ามาเลยสักหน้า แถบนั้นจึงไม่เคยแสดงบนจอจริง
 * (การนำทางฝั่งร้านอยู่บน AppHeader ซึ่งใช้งานได้ตั้งแต่จอแคบอยู่แล้ว) — ลบทิ้งทั้งคู่
 * ดีกว่าปล่อยโค้ดที่อ่านแล้วเข้าใจผิดว่ามีแถบล่างอยู่
 *
 * หน้าที่ยังใส่ `pb-20` เองเป็นการเว้นที่ให้ **แถบปุ่มลอยของหน้านั้น** (เช่นปุ่ม
 * "ตรวจสอบคำสั่ง" ที่ /stock) ไม่เกี่ยวกับแถบเมนูที่ลบไป
 */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-screen vmi-mesh-bg", className)}>{children}</div>
  );
}

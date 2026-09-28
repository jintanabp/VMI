import { CreatorOnlyLayout } from "@/components/admin/creator-only-layout";

/**
 * จัดการผู้ดูแลระบบ = creator (อีเมลใน .env) เท่านั้น — ดู lib/auth/permissions.ts
 * (แท็บ "สิทธิ์เซลล์-VDA" ในหมวดเดียวกัน admin เข้าได้ จึงกันที่หน้านี้ ไม่ใช่ทั้งหมวด)
 */
export default CreatorOnlyLayout;

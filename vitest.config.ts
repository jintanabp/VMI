import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * เทสต์เฉพาะ logic ล้วน (pure function) ที่พังแล้วเจ็บ
 *
 * ไม่แตะ component / API route โดยตั้งใจ — พวกนั้นต้องมี DOM หรือ DB
 * ซึ่งทำให้เทสต์ช้าและเปราะ ส่วนที่คุ้มที่สุดคือสูตรคำนวณกับกฎธุรกิจ
 * ที่เคยมีบั๊กจริงมาแล้ว (ธง CVD, การแบ่ง PO, ของแถมโปรกลุ่ม)
 *
 * **ข้อยกเว้นเดียว** (`*.db.test.ts`): ตรรกะระดับ lib ที่เป็นทรานแซกชันจริง
 * พิสูจน์ด้วย pure function ไม่ได้ — เช่น compare-and-set ตอนอนุมัติออเดอร์
 * ที่ต้องรู้ว่าสองคนกดพร้อมกันแล้วมีคนเดียวชนะ ใช้ SQLite ชั่วคราวผ่าน
 * tests/helpers/test-db.ts (ช้ากว่าปกติเพราะต้อง prisma db push ก่อน)
 * ยังคงห้ามใช้กับ API route และ component
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // ไฟล์เทสต์อ่านง่ายกว่าเมื่อชื่อ describe เป็นภาษาไทย
    reporters: "default",
  },
});

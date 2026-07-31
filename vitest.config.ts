import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * เทสต์เฉพาะ logic ล้วน (pure function) ที่พังแล้วเจ็บ
 *
 * ไม่แตะ component / API route โดยตั้งใจ — พวกนั้นต้องมี DOM หรือ DB
 * ซึ่งทำให้เทสต์ช้าและเปราะ ส่วนที่คุ้มที่สุดคือสูตรคำนวณกับกฎธุรกิจ
 * ที่เคยมีบั๊กจริงมาแล้ว (ธง CVD, การแบ่ง PO, ของแถมโปรกลุ่ม)
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

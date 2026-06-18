import fs from "fs";
import net from "net";
import path from "path";

const PORT = Number(process.env.PORT ?? 3000);

function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    // ตรวจแบบเดียวกับ Next.js (bind ทุก interface รวม IPv6)
    server.listen(port);
  });
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(".env")) {
  fail("❌ ไม่พบไฟล์ .env\n   คัดลอกจาก .env.example แล้วใส่ค่าที่จำเป็น");
}

const dbPath = path.join("prisma", "dev.db");
if (!fs.existsSync(dbPath)) {
  fail("❌ ไม่พบ database (prisma/dev.db)\n   รัน: npm run db:setup");
}

if (!fs.existsSync("node_modules")) {
  fail("❌ ยังไม่ได้ติดตั้ง dependencies\n   รัน: npm install");
}

if (await portInUse(PORT)) {
  fail(
    `❌ Port ${PORT} ถูกใช้อยู่แล้ว (มักเป็น dev server เก่าที่ยังรันอยู่)\n` +
      "   Windows — หา PID:\n" +
      `     netstat -ano | findstr :${PORT}\n` +
      "   แล้วปิด process:\n" +
      "     taskkill /PID <เลขPID> /F\n" +
      "\n   หรือปิด terminal เก่าที่รัน npm run dev แล้วลองใหม่\n" +
      `\n   ⚠ ถ้า Next.js ขึ้นที่ port อื่น (เช่น 3001) Microsoft login จะใช้ไม่ได้\n` +
      `   เพราะ Azure ตั้ง redirect ไว้ที่ http://localhost:${PORT}/auth/callback`
  );
}

console.log(`✓ พร้อมรัน dev server ที่ http://localhost:${PORT}`);

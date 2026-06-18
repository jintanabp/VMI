import { execSync } from "child_process";

const PORT = process.env.PORT ?? "3000";

try {
  const out = execSync(`netstat -ano | findstr :${PORT}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });

  const pids = new Set(
    out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("LISTENING"))
      .map((line) => line.split(/\s+/).pop())
      .filter((pid) => pid && pid !== "0")
  );

  if (pids.size === 0) {
    console.log(`ไม่พบ process ที่ listen port ${PORT}`);
    process.exit(0);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`ปิด process PID ${pid} แล้ว`);
    } catch {
      console.warn(`ปิด PID ${pid} ไม่สำเร็จ (อาจปิดไปแล้ว)`);
    }
  }
} catch {
  console.log(`ไม่พบ process ที่ใช้ port ${PORT}`);
}

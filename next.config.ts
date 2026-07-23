import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/vmi",
  trailingSlash: true,
  // gzip response ที่ Node layer (สำหรับ payload stock/order ที่เป็น JSON ก้อนใหญ่)
  compress: true,
  // ไม่ต้องส่ง header X-Powered-By
  poweredByHeader: false,
  // production ไม่ต้องแนบ browser source map — build เร็วขึ้น, bundle เบาลง
  productionBrowserSourceMaps: false,
};

export default nextConfig;

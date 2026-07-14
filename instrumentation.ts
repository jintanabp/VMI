export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapAdminsFromEnv } = await import("./lib/auth/admin-registry");
    await bootstrapAdminsFromEnv().catch((err) => {
      console.warn("[VMI] Admin bootstrap skipped:", err);
    });

    const { startMasterRefreshScheduler } = await import(
      "./lib/fabric/scheduler"
    );
    startMasterRefreshScheduler();

    // preload master ทั้งหมดตอน boot (นอก request path) — กัน request แรก/หลัง sync
    // ต้อง parse ไฟล์ SKU 68MB แบบ sync บน request thread แล้วทำให้ผู้ใช้รู้สึกหน่วง
    try {
      const { warmFabricMasters } = await import("./lib/fabric");
      const t0 = Date.now();
      warmFabricMasters();
      console.info(`[VMI] Fabric masters preloaded in ${Date.now() - t0}ms`);
    } catch (err) {
      console.warn("[VMI] Master preload skipped:", err);
    }
  }
}

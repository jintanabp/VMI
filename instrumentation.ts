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
  }
}

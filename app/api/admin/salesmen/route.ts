import { NextResponse } from "next/server";
import { getSalesmanRegistry } from "@/lib/fabric";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { prisma } from "@/lib/prisma";

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function GET() {
  const rawSession = await getRawSalesSession();
  const session = rawSession;
  if (!session || !["admin", "manager", "supervisor"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedRows = await prisma.allowedSalesCode.findMany({
    select: { code: true },
  });
  const allowed = new Set(allowedRows.map((r) => normalizeCode(r.code)));

  const reps = await prisma.salesRep.findMany({ orderBy: { name: "asc" } });
  const registry = getSalesmanRegistry();

  return NextResponse.json(
    reps
      .filter((r) => {
        if (session.role === "admin") return true;
        const allowed = new Set((session.scopeEmails ?? []).map((e) => e.toLowerCase()));
        return allowed.has(r.email.toLowerCase());
      })
      .map((r) => {
        const fabric = registry.getCurrentByEmail(r.email);
        return {
          id: r.id,
          email: r.email,
          code: fabric?.code ?? r.email.split("@")[0],
          name: fabric ? registry.getDisplayName(fabric) : r.name,
          employeeNo: fabric?.employeeNo ?? "",
        };
      })
      .filter((r) => (allowed.size === 0 ? true : allowed.has(normalizeCode(r.code))))
      .sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
      )
  );
}

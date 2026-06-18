import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const storeCount = await prisma.store.count();
    return NextResponse.json({
      ok: true,
      database: true,
      stores: storeCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: false,
        error:
          error instanceof Error ? error.message : "Database connection failed",
      },
      { status: 500 }
    );
  }
}

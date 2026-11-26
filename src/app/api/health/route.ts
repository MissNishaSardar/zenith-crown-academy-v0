import { NextResponse } from "next/server";

import { getHealthSnapshot, toPublicHealth } from "@/server/system/health";

export const dynamic = "force-dynamic";

export const GET = async () => {
  try {
    const snapshot = await getHealthSnapshot();
    const body = toPublicHealth(snapshot);
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
      status: snapshot.database.ok ? 200 : 503,
    });
  } catch {
    return NextResponse.json(
      {
        db: { latencyMs: null, reachable: false },
        status: "degraded",
        timestamp: new Date().toISOString(),
        version: "unknown",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
};

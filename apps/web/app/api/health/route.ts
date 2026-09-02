import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { type NextRequest, NextResponse } from "next/server";
import prisma from "@calcom/prisma";
import { APP_NAME } from "@calcom/lib/constants";

const APP_VERSION = process.env.npm_package_version || "2.0.0";

async function healthHandler(req: NextRequest) {
  const startTime = Date.now();
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let dbLatencyMs = -1;
  let dbError: string | null = null;

  try {
    const dbStart = Date.now();
    // Quick query to verify database connection and schema health
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "connected";
  } catch (error) {
    dbStatus = "disconnected";
    dbError = error instanceof Error ? error.message : String(error);
  }

  const isHealthy = dbStatus === "connected";
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      service: "crove-cal",
      appName: APP_NAME,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      totalLatencyMs: Date.now() - startTime,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs >= 0 ? dbLatencyMs : undefined,
        error: dbError || undefined,
      },
    },
    {
      status: statusCode,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export const GET = defaultResponderForAppDir(healthHandler);
export const HEAD = defaultResponderForAppDir(healthHandler);


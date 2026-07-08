import { NextResponse } from "next/server";
import { SERVER_BACKEND_URL } from "@/lib/backend-url";
import { sanitizeErrorMessage } from "@/lib/safe-error";

export async function GET() {
  try {
    const response = await fetch(`${SERVER_BACKEND_URL}/health`, {
      cache: "no-store",
      headers: {
        "User-Agent": "VibeDigest-FrontendHealth/1.0",
      },
    });

    const payload = await response.json().catch(() => null);
    return NextResponse.json(
      {
        status: response.ok ? "healthy" : "unhealthy",
        backendStatus: response.status,
        backend: payload,
      },
      { status: response.ok ? 200 : 502 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: sanitizeErrorMessage(error, "Backend origin health check failed"),
      },
      { status: 502 }
    );
  }
}

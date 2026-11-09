import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";

const backendUrl =
  process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

export async function proxyBackend(
  path: string,
  request: NextRequest,
  method: "GET" | "POST"
) {
  await connection();

  try {
    const headers: Record<string, string> = {};

    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }

    const bypassSecret =
      process.env.BACKEND_VERCEL_PROTECTION_BYPASS;

    if (bypassSecret) {
      headers["x-vercel-protection-bypass"] = bypassSecret;
    }

    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers,
      body: method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (
      !contentType.includes("application/json") &&
      !contentType.includes("+json")
    ) {
      console.error(
        `Backend returned non-JSON response for ${path}:`,
        {
          status: response.status,
          contentType,
          redirected: response.redirected,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: "The backend returned an unexpected response.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`Backend request failed for ${path}:`, error);

    return NextResponse.json(
      {
        success: false,
        error: "The analysis backend is unavailable.",
      },
      { status: 502 }
    );
  }
}

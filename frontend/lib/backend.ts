import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";

const backendUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

export async function proxyBackend(
  path: string,
  request: NextRequest,
  method: "GET" | "POST"
) {
  await connection();
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`Backend request failed for ${path}:`, error);
    return NextResponse.json(
      { success: false, error: "The analysis backend is unavailable." },
      { status: 502 }
    );
  }
}

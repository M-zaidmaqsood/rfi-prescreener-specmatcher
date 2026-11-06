
import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export const instant = false;

export async function GET(request: NextRequest) {
  return proxyBackend("/api/rfi/queue", request, "GET");
}

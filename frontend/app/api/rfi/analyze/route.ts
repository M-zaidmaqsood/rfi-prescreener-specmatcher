import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export async function POST(request: NextRequest) {
  return proxyBackend("/api/rfi/analyze", request, "POST");
}

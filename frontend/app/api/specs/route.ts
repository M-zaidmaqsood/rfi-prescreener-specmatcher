
import { NextResponse } from "next/server";
import specs from "@/data/specs.json";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      count: specs.length,
      specs,
    });
  } catch (error) {
    console.error("Failed to load specifications:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load project specifications.",
      },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import { rfiInquiries } from "@/lib/store";

export async function GET() {
  try {
    const inquiries = [...rfiInquiries].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    console.error("Failed to load RFI queue:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load the RFI review queue.",
      },
      { status: 500 }
    );
  }
}

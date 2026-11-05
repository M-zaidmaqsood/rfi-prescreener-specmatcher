
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { rfiInquiries, rfiAuditLogs } from "@/lib/store";
import type { AuditLogEntry, ReviewRequest } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ReviewRequest>;

    if (
      typeof body.inquiryId !== "string" ||
      !body.inquiryId.trim() ||
      typeof body.reviewer !== "string" ||
      !body.reviewer.trim() ||
      (body.decision !== "APPROVED" &&
        body.decision !== "DEFLECTED")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Inquiry ID, valid decision, and reviewer are required.",
        },
        { status: 400 }
      );
    }

    const inquiry = rfiInquiries.find(
      (item) => item.id === body.inquiryId
    );

    if (!inquiry) {
      return NextResponse.json(
        { success: false, error: "RFI inquiry not found." },
        { status: 404 }
      );
    }

    if (inquiry.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { success: false, error: "This RFI has already been reviewed." },
        { status: 409 }
      );
    }

    if (
      body.decision === "DEFLECTED" &&
      (inquiry.confidence < 0.8 || !inquiry.isVerbatimVerified)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Deflection is blocked because confidence is below 0.80 or the supporting quote is not verified.",
        },
        { status: 400 }
      );
    }

    if (body.editedDraft !== undefined) {
      const draft = body.editedDraft;

      if (
        draft === null ||
        typeof draft !== "object" ||
        ![
          "subject",
          "clarifiedQuestion",
          "suggestedSolution",
          "costImpact",
          "scheduleImpact",
        ].every(
          (field) =>
            typeof draft[field as keyof typeof draft] === "string"
        )
      ) {
        return NextResponse.json(
          { success: false, error: "The edited RFI draft is invalid." },
          { status: 400 }
        );
      }

      inquiry.draft = { ...draft };

      const editLog: AuditLogEntry = {
        id: randomUUID(),
        inquiryId: inquiry.id,
        action: "EDITED",
        reviewer: body.reviewer.trim(),
        notes: body.notes?.trim() || "RFI draft edited.",
        timestamp: new Date().toISOString(),
      };

      rfiAuditLogs.push(editLog);
    }

    inquiry.status = body.decision;

    const reviewLog: AuditLogEntry = {
      id: randomUUID(),
      inquiryId: inquiry.id,
      action: body.decision,
      reviewer: body.reviewer.trim(),
      notes: body.notes?.trim() || "No additional notes.",
      timestamp: new Date().toISOString(),
    };

    rfiAuditLogs.push(reviewLog);

    return NextResponse.json({
      success: true,
      message: `RFI ${body.decision.toLowerCase()} successfully.`,
      inquiry,
      auditLogs: rfiAuditLogs.filter(
        (log) => log.inquiryId === inquiry.id
      ),
    });
  } catch (error) {
    console.error("RFI review failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to process the RFI review.",
      },
      { status: 500 }
    );
  }
}

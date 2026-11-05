import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import specs from "@/data/specs.json";
import { rfiInquiries } from "@/lib/store";
import type {
  Recommendation,
  RFIAnalysis,
  RFIInquiry,
  SpecSection,
} from "@/types";

interface AnalyzeRequest {
  question: string;
  trade: string;
  drawingReference: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function calculateScore(question: string, section: SpecSection): number {
  const questionWords = new Set(tokenize(question));
  const sectionWords = new Set(
    tokenize(`${section.sectionNumber} ${section.title} ${section.content}`)
  );

  if (questionWords.size === 0) return 0;

  let matches = 0;

  for (const word of questionWords) {
    if (sectionWords.has(word)) matches++;
  }

  return matches / questionWords.size;
}

function analyzeQuestion(input: AnalyzeRequest): RFIAnalysis {
  const allSpecs = specs as SpecSection[];

  const rankedSpecs = allSpecs
    .map((section) => ({
      section,
      score: calculateScore(`${input.question} ${input.trade}`, section),
    }))
    .sort((a, b) => b.score - a.score);

  const bestMatch = rankedSpecs[0];
  const hasMatch = bestMatch !== undefined && bestMatch.score >= 0.15;

  if (hasMatch && bestMatch) {
    const section = bestMatch.section;

    const sentences = section.content.match(/[^.!?]+[.!?]+/g) ?? [];

    const matchingSentence = sentences
      .map((sentence) => ({
        sentence: sentence.trim(),
        score: calculateScore(
          `${input.question} ${input.trade}`,
          { ...section, content: sentence }
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];

    const citedQuote =
      matchingSentence && matchingSentence.score > 0
        ? matchingSentence.sentence
        : section.content.split(".")[0].trim() + ".";

    const isVerbatimVerified = section.content.includes(citedQuote);
    const confidence = Math.min(0.95, Number(bestMatch.score.toFixed(2)));

    const recommendation: Recommendation =
      isVerbatimVerified && confidence >= 0.3
        ? "DEFLECT_ALREADY_IN_SPECS"
        : "VALID_GAP_ESCALATE_TO_ARCHITECT";

    return {
      recommendation,
      confidence,
      matchedSectionId: section.id,
      matchedSectionNumber: section.sectionNumber,
      matchedSectionTitle: section.title,
      citedQuote,
      isVerbatimVerified,
      reasoning: isVerbatimVerified
        ? `A potentially relevant requirement was found in specification section ${section.sectionNumber}. Human review is required before any decision.`
        : "A relevant section was found, but its supporting quote could not be verified.",
      draft:
        recommendation === "VALID_GAP_ESCALATE_TO_ARCHITECT"
          ? {
              subject: `RFI - ${input.trade} - ${input.drawingReference || "No drawing reference"}`,
              clarifiedQuestion: input.question,
              suggestedSolution: "Please review the condition and provide direction.",
              costImpact: "To be determined by the project team.",
              scheduleImpact: "To be determined by the project team.",
            }
          : null,
    };
  }

  return {
    recommendation: "VALID_GAP_ESCALATE_TO_ARCHITECT",
    confidence: 0.2,
    matchedSectionId: null,
    matchedSectionNumber: null,
    matchedSectionTitle: null,
    citedQuote: null,
    isVerbatimVerified: false,
    reasoning:
      "No sufficiently relevant specification section was found. Human review and architect input are recommended.",
    draft: {
      subject: `RFI - ${input.trade} - ${input.drawingReference || "No drawing reference"}`,
      clarifiedQuestion: input.question,
      suggestedSolution: "Please review the condition and provide direction.",
      costImpact: "To be determined by the project team.",
      scheduleImpact: "To be determined by the project team.",
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AnalyzeRequest>;

    if (
      typeof body.question !== "string" ||
      !body.question.trim() ||
      typeof body.trade !== "string" ||
      !body.trade.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "Question and trade are required." },
        { status: 400 }
      );
    }

    const urgency = body.urgency ?? "MEDIUM";

    if (!["LOW", "MEDIUM", "HIGH"].includes(urgency)) {
      return NextResponse.json(
        { success: false, error: "Urgency must be LOW, MEDIUM, or HIGH." },
        { status: 400 }
      );
    }

    const input: AnalyzeRequest = {
      question: body.question.trim(),
      trade: body.trade.trim(),
      drawingReference:
        typeof body.drawingReference === "string"
          ? body.drawingReference.trim()
          : "",
      urgency,
    };

    const analysis = analyzeQuestion(input);

    const inquiry: RFIInquiry = {
      id: randomUUID(),
      question: input.question,
      trade: input.trade,
      drawingReference: input.drawingReference,
      urgency: input.urgency,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      matchedSectionId: analysis.matchedSectionId,
      matchedSectionNumber: analysis.matchedSectionNumber,
      matchedSectionTitle: analysis.matchedSectionTitle,
      citedQuote: analysis.citedQuote,
      isVerbatimVerified: analysis.isVerbatimVerified,
      reasoning: analysis.reasoning,
      draft: analysis.draft,
      status: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
    };

    rfiInquiries.push(inquiry);

    return NextResponse.json(
      {
        success: true,
        inquiry,
        analysisProvider: "DETERMINISTIC_FALLBACK",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("RFI analysis failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to analyze the RFI. Please try again.",
      },
      { status: 500 }
    );
  }
}

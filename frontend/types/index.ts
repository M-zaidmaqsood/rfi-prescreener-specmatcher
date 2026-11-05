
export interface SpecSection {
  id: string;
  sectionNumber: string;
  title: string;
  content: string;
}

export type Recommendation =
  | "DEFLECT_ALREADY_IN_SPECS"
  | "DEFLECT_DUPLICATE_RFI"
  | "VALID_GAP_ESCALATE_TO_ARCHITECT";

export type RFIStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "DEFLECTED";

export interface RFIAnalysis {
  recommendation: Recommendation;
  confidence: number;
  matchedSectionId: string | null;
  matchedSectionNumber: string | null;
  matchedSectionTitle: string | null;
  citedQuote: string | null;
  isVerbatimVerified: boolean;
  reasoning: string;
  draft: {
    subject: string;
    clarifiedQuestion: string;
    suggestedSolution: string;
    costImpact: string;
    scheduleImpact: string;
  } | null;
}

export interface RFIInquiry {
  id: string;
  question: string;
  trade: string;
  drawingReference: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  recommendation: Recommendation;
  confidence: number;
  matchedSectionId: string | null;
  matchedSectionNumber: string | null;
  matchedSectionTitle: string | null;
  citedQuote: string | null;
  isVerbatimVerified: boolean;
  reasoning: string;
  draft: RFIAnalysis["draft"];
  status: RFIStatus;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  inquiryId: string;
  action: "APPROVED" | "DEFLECTED" | "EDITED";
  reviewer: string;
  notes: string;
  timestamp: string;
}

export interface ReviewRequest {
  inquiryId: string;
  decision: "APPROVED" | "DEFLECTED";
  reviewer: string;
  notes: string;
  editedDraft?: RFIAnalysis["draft"];
}

export interface SpecSection {
  id: string;
  section_id: string;
  title: string;
  text: string;
  similarity?: number;
}

export interface SupportingQuote {
  quote: string | null;
  section_id: string | null;
  verified: boolean;
}

export interface Draft {
  subject: string;
  clarified_question: string;
  suggested_solution: string;
  cost_impact: string;
  schedule_impact: string;
}

export interface Analysis {
  provider: string;
  fallback_reason?: string;
  preliminary_assessment: string;
  recommendation: string;
  confidence: number;
  specification_sections: SpecSection[];
  supporting_quotes: SupportingQuote[];
  relevance_explanation: string;
  potential_gaps: string[];
  follow_up_questions: string[];
  human_review_recommendation: string;
  draft: Draft | null;
}

export interface AuditLogEntry {
  id: string;
  rfi_id: string;
  action: string;
  reviewer: string;
  notes: string;
  previous_status: string | null;
  new_status: string | null;
  timestamp: string;
}

export interface RFIInquiry {
  id: string;
  title: string;
  question: string;
  trade: string;
  drawing_reference: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING_REVIEW" | "APPROVED" | "DEFLECTED";
  created_at: string;
  updated_at: string;
  analysis: Analysis;
  audit_logs: AuditLogEntry[];
}

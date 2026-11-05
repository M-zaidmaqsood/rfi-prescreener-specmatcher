
"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { RFIInquiry } from "@/types";

export default function Home() {
  const [inquiries, setInquiries] = useState<RFIInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] =
    useState<RFIInquiry | null>(null);

  const [question, setQuestion] = useState("");
  const [trade, setTrade] = useState("Concrete");
  const [drawingReference, setDrawingReference] = useState("");
  const [urgency, setUrgency] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [reviewer, setReviewer] = useState("Project Engineer");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadQueue() {
    try {
      const response = await fetch("/api/rfi/queue");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load RFI queue.");
      }

      setInquiries(data.inquiries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load RFI queue."
      );
    }
  }
useEffect(() => {
  fetch("/api/rfi/queue")
    .then(async (response) => {
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load RFI queue.");
      }

      return data;
    })
    .then((data) => {
      setInquiries(data.inquiries);
    })
    .catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Unable to load RFI queue."
      );
    });
}, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/rfi/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          trade,
          drawingReference,
          urgency,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "RFI submission failed.");
      }

      setQuestion("");
      setDrawingReference("");
      setMessage("RFI submitted and analyzed successfully.");
      await loadQueue();
      setSelectedInquiry(data.inquiry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(decision: "APPROVED" | "DEFLECTED") {
    if (!selectedInquiry) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/rfi/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          decision,
          reviewer,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Review action failed.");
      }

      setMessage(data.message);
      setSelectedInquiry(data.inquiry);
      setNotes("");
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setLoading(false);
    }
  }

  const pendingCount = inquiries.filter(
    (item) => item.status === "PENDING_REVIEW"
  ).length;

  const approvedCount = inquiries.filter(
    (item) => item.status === "APPROVED"
  ).length;

  const deflectedCount = inquiries.filter(
    (item) => item.status === "DEFLECTED"
  ).length;

  const canDeflect =
    selectedInquiry !== null &&
    selectedInquiry.confidence >= 0.8 &&
    selectedInquiry.isVerbatimVerified;

  function recommendationLabel(value: string) {
    if (value === "DEFLECT_ALREADY_IN_SPECS") {
      return "Already in specifications";
    }

    if (value === "DEFLECT_DUPLICATE_RFI") {
      return "Duplicate RFI";
    }

    return "Escalate to architect";
  }

  function statusLabel(value: string) {
    return value.replaceAll("_", " ");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              RFI Pre-Screener
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Specification matching and review console
            </p>
          </div>

          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            MVP Demo
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section>
          <h2 className="mb-4 text-lg font-semibold">RFI Overview</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total RFIs", value: inquiries.length },
              { label: "Pending Review", value: pendingCount },
              { label: "Approved", value: approvedCount },
              { label: "Deflected", value: deflectedCount },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold">Submit a New RFI</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">
              Enter an inquiry for automatic specification screening.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  RFI Question *
                </label>
                <textarea
                  required
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Describe the construction inquiry..."
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Trade *
                </label>
                <select
                  value={trade}
                  onChange={(event) => setTrade(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                >
                  {[
                    "Concrete",
                    "Structural",
                    "Architectural",
                    "Plumbing",
                    "HVAC",
                    "Electrical",
                    "Other",
                  ].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Drawing Reference
                </label>
                <input
                  value={drawingReference}
                  onChange={(event) =>
                    setDrawingReference(event.target.value)
                  }
                  placeholder="e.g. S-101"
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Urgency
                </label>
                <select
                  value={urgency}
                  onChange={(event) =>
                    setUrgency(event.target.value as "LOW" | "MEDIUM" | "HIGH")
                  }
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Processing..." : "Analyze and Submit RFI"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">RFI Review Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select an inquiry to inspect its analysis.
                </p>
              </div>

              <button
                onClick={() => void loadQueue()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            {inquiries.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500">
                No inquiries yet. Submit your first RFI.
              </div>
            ) : (
              <div className="space-y-3">
                {inquiries.map((inquiry) => (
                  <button
                    key={inquiry.id}
                    onClick={() => {
                      setSelectedInquiry(inquiry);
                      setError("");
                      setMessage("");
                    }}
                    className={`w-full rounded-lg border p-4 text-left transition hover:border-blue-400 ${
                      selectedInquiry?.id === inquiry.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {inquiry.trade} - {inquiry.drawingReference || "No drawing"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">
                        {statusLabel(inquiry.status)}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {inquiry.question}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-blue-100 px-2 py-1 text-blue-800">
                        {recommendationLabel(inquiry.recommendation)}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                        Confidence: {Math.round(inquiry.confidence * 100)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {selectedInquiry && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">RFI Review Details</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Inquiry ID: {selectedInquiry.id}
                </p>
              </div>

              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {statusLabel(selectedInquiry.status)}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Original Question</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedInquiry.question}
                </p>

                <h3 className="mt-5 text-sm font-semibold">
                  Screening Recommendation
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {recommendationLabel(selectedInquiry.recommendation)}
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Confidence:{" "}
                  <strong>
                    {Math.round(selectedInquiry.confidence * 100)}%
                  </strong>
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Verbatim quote verified:{" "}
                  <strong>
                    {selectedInquiry.isVerbatimVerified ? "Yes" : "No"}
                  </strong>
                </p>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {selectedInquiry.reasoning}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Matched Specification
                </h3>

                {selectedInquiry.matchedSectionNumber ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-blue-700">
                      Section {selectedInquiry.matchedSectionNumber}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedInquiry.matchedSectionTitle}
                    </p>

                    <blockquote className="mt-3 rounded-lg border-l-4 border-blue-500 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      {selectedInquiry.citedQuote || "No supporting quote."}
                    </blockquote>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No matching specification section was found.
                  </p>
                )}
              </div>
            </div>

            {selectedInquiry.draft && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold">Draft RFI</h3>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {Object.entries(selectedInquiry.draft).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          {key.replace(/([A-Z])/g, " $1")}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{value}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {selectedInquiry.status === "PENDING_REVIEW" && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold">Human Review</h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Reviewer
                    </label>
                    <input
                      value={reviewer}
                      onChange={(event) => setReviewer(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Review Notes
                    </label>
                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional review notes"
                      className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={() => void handleReview("APPROVED")}
                    disabled={loading || !reviewer.trim()}
                    className="rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    Approve RFI
                  </button>

                  <button
                    onClick={() => void handleReview("DEFLECTED")}
                    disabled={loading || !reviewer.trim() || !canDeflect}
                    className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Deflect RFI
                  </button>
                </div>

                {!canDeflect && (
                  <p className="mt-3 text-xs text-amber-700">
                    Deflection is disabled because confidence is below 80%
                    or the supporting quote is not verified.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500">
          Independent RFI screening MVP. Human review is required for every
          inquiry.
        </footer>
      </div>
    </main>
  );
}

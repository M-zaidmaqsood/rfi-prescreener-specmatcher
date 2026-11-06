"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Draft, RFIInquiry } from "@/types";

const initialDraft: Draft = {
  subject: "",
  clarified_question: "",
  suggested_solution: "",
  cost_impact: "",
  schedule_impact: "",
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function badgeClass(status: string) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "DEFLECTED") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export default function Home() {
  const [inquiries, setInquiries] = useState<RFIInquiry[]>([]);
  const [selected, setSelected] = useState<RFIInquiry | null>(null);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [trade, setTrade] = useState("Concrete");
  const [drawingReference, setDrawingReference] = useState("");
  const [urgency, setUrgency] = useState("MEDIUM");
  const [reviewer, setReviewer] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadQueue() {
    const response = await fetch("/api/rfi/queue", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Unable to load queue.");
    setInquiries(data.inquiries);
    if (selected) {
      const current = data.inquiries.find((item: RFIInquiry) => item.id === selected.id);
      if (current) {
        setSelected(current);
        setDraft(current.analysis.draft || initialDraft);
      }
    }
  }

  useEffect(() => {
    fetch("/api/rfi/queue", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load queue.");
        }
        setInquiries(data.inquiries);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unable to load queue.")
      );
  }, []);

  function selectInquiry(inquiry: RFIInquiry) {
    setSelected(inquiry);
    setDraft(inquiry.analysis.draft || initialDraft);
    setMessage("");
    setError("");
  }

  async function submitRfi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/rfi/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, question, trade, drawing_reference: drawingReference, urgency }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.error || "RFI submission failed.");
      setTitle("");
      setQuestion("");
      setDrawingReference("");
      setMessage(`RFI submitted. ${data.inquiry.analysis.provider === "FALLBACK" ? "FALLBACK analysis requires additional review." : "Evidence retrieved and analyzed."}`);
      await loadQueue();
      selectInquiry(data.inquiry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "RFI submission failed.");
    } finally {
      setLoading(false);
    }
  }

  async function review(decision: "APPROVED" | "DEFLECTED") {
    if (!selected || !reviewer.trim()) {
      setError("Enter reviewer name before recording a decision.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/rfi/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfi_id: selected.id,
          decision,
          reviewer,
          notes,
          edited_draft: selected.analysis.draft ? draft : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.error || "Review action failed.");
      setMessage(data.message);
      setNotes("");
      setSelected(data.inquiry);
      setDraft(data.inquiry.analysis.draft || initialDraft);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed.");
    } finally {
      setLoading(false);
    }
  }

  const pending = inquiries.filter((item) => item.status === "PENDING_REVIEW").length;
  const approved = inquiries.filter((item) => item.status === "APPROVED").length;
  const deflected = inquiries.filter((item) => item.status === "DEFLECTED").length;
  const hasVerifiedQuote = selected?.analysis.supporting_quotes.some((item) => item.verified) ?? false;
  const canDeflect = Boolean(selected && selected.analysis.confidence >= 0.8 && hasVerifiedQuote);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Field intelligence</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">RFI Pre-Screener</h1>
            <p className="mt-1 text-sm text-slate-500">Evidence-first specification matching and human review</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">MVP DEMO</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-7">
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Total RFIs", inquiries.length],
            ["Pending review", pending],
            ["Approved", approved],
            ["Deflected", deflected],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <section className="grid gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
          <form onSubmit={submitRfi} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Submit a new RFI</h2>
            <p className="mt-1 text-sm text-slate-500">The backend retrieves up to five specification sections before analysis.</p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium">Title *
                <input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="Concrete placement at grid A-4" />
              </label>
              <label className="block text-sm font-medium">Question / description *
                <textarea required minLength={5} value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="Describe the field condition or question..." />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Trade *
                  <select value={trade} onChange={(event) => setTrade(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3">
                    {["Concrete", "Structural", "Architectural", "Plumbing", "HVAC", "Electrical", "Other"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">Urgency
                  <select value={urgency} onChange={(event) => setUrgency(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3">
                    <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">Drawing / location reference
                <input value={drawingReference} onChange={(event) => setDrawingReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="S-101 / Level 2" />
              </label>
              <button disabled={loading} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{loading ? "Analyzing..." : "Analyze and submit"}</button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div><h2 className="text-lg font-semibold">RFI review queue</h2><p className="mt-1 text-sm text-slate-500">Select an item to inspect evidence and record a human decision.</p></div>
              <button onClick={() => loadQueue().catch((err: unknown) => setError(err instanceof Error ? err.message : "Refresh failed."))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Refresh</button>
            </div>
            <div className="mt-5 space-y-3">
              {inquiries.length === 0 ? <div className="rounded-lg bg-slate-50 p-10 text-center text-sm text-slate-500">No RFIs yet. Submit the first inquiry.</div> : inquiries.map((inquiry) => (
                <button key={inquiry.id} onClick={() => selectInquiry(inquiry)} className={`w-full rounded-lg border p-4 text-left ${selected?.id === inquiry.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
                  <div className="flex items-start justify-between gap-3"><span className="font-semibold">{inquiry.title}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badgeClass(inquiry.status)}`}>{statusLabel(inquiry.status)}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{inquiry.question}</p>
                  <p className="mt-3 text-xs text-slate-500">{inquiry.trade} · {Math.round(inquiry.analysis.confidence * 100)}% confidence · {inquiry.analysis.provider}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {selected && <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Review detail</p><h2 className="mt-1 text-xl font-bold">{selected.title}</h2><p className="mt-1 text-xs text-slate-500">{selected.id} · {selected.trade} · {selected.drawing_reference || "No drawing reference"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(selected.status)}`}>{statusLabel(selected.status)}</span></div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Submitted question</h3><p className="mt-2 text-sm leading-6 text-slate-600">{selected.question}</p>
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex justify-between text-sm"><span>Confidence</span><strong>{Math.round(selected.analysis.confidence * 100)}%</strong></div><div className="mt-2 h-2 rounded-full bg-slate-200"><div className={`h-2 rounded-full ${selected.analysis.confidence >= 0.8 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.round(selected.analysis.confidence * 100)}%` }} /></div><p className="mt-3 text-sm text-slate-600">{selected.analysis.preliminary_assessment}</p>{selected.analysis.confidence < 0.8 && <p className="mt-2 text-sm font-semibold text-amber-700">Additional human review is required below the 0.80 threshold.</p>}</div>
              <h3 className="mt-5 font-semibold">AI interpretation</h3><p className="mt-2 text-sm leading-6 text-slate-600">{selected.analysis.relevance_explanation}</p>
              {selected.analysis.fallback_reason && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><strong>FALLBACK:</strong> {selected.analysis.fallback_reason}</p>}
            </div>
            <div>
              <h3 className="font-semibold">Retrieved specification evidence</h3>
              <div className="mt-3 space-y-3">{selected.analysis.specification_sections.map((section) => <div key={section.id} className="rounded-lg border border-slate-200 p-4"><div className="flex justify-between gap-3"><strong className="text-sm">{section.section_id} · {section.title}</strong>{section.similarity !== undefined && <span className="text-xs text-slate-500">{section.similarity.toFixed(3)}</span>}</div><p className="mt-2 text-sm leading-6 text-slate-600">{section.text}</p></div>)}</div>
              <h3 className="mt-5 font-semibold">Supporting quotes</h3>
              <div className="mt-3 space-y-2">{selected.analysis.supporting_quotes.length === 0 ? <p className="text-sm text-slate-500">No quote returned.</p> : selected.analysis.supporting_quotes.map((item, index) => <div key={`${item.section_id}-${index}`} className={`rounded-lg border p-3 text-sm ${item.verified ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><p>{item.quote || "Empty quote"}</p><p className="mt-2 text-xs font-bold">{item.verified ? "VERIFIED AGAINST SOURCE" : "UNVERIFIED — NOT EVIDENCE"} · {item.section_id || "Unknown section"}</p></div>)}</div>
            </div>
          </div>
          {selected.analysis.draft && <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold">Editable draft response</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{(Object.keys(draft) as (keyof Draft)[]).map((field) => <label key={field} className="text-sm font-medium">{field.replaceAll("_", " ")}<textarea value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} rows={field === "subject" ? 2 : 3} className="mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>)}</div></div>}
          {selected.status === "PENDING_REVIEW" && <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold">Human decision</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Reviewer name *" className="rounded-lg border border-slate-300 p-3" /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reviewer notes (recommended)" rows={2} className="rounded-lg border border-slate-300 p-3" /></div><div className="mt-3 flex flex-wrap gap-3"><button disabled={loading} onClick={() => review("APPROVED")} className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Approve</button><button disabled={loading || !canDeflect} onClick={() => review("DEFLECTED")} className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Deflect {canDeflect ? "" : "(requires 80% + verified quote)"}</button></div></div>}
          <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold">Audit history</h3>{selected.audit_logs.length === 0 ? <p className="mt-2 text-sm text-slate-500">No review actions recorded.</p> : <div className="mt-3 space-y-2">{selected.audit_logs.map((log) => <div key={log.id} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{log.action}</strong> by {log.reviewer} · {new Date(log.timestamp).toLocaleString()}<p className="mt-1 text-slate-600">{log.notes}</p></div>)}</div>}</div>
        </section>}
        <p className="text-center text-xs text-slate-500">Illustrative sample specifications only. This MVP is not affiliated with or endorsed by Procore. Every result requires human review.</p>
      </div>
    </main>
  );
}

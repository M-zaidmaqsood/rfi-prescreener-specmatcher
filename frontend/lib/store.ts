
import type { AuditLogEntry, RFIInquiry } from "@/types";

// Temporary in-memory storage for local development.
const globalForStore = globalThis as typeof globalThis & {
  rfiInquiries?: RFIInquiry[];
  rfiAuditLogs?: AuditLogEntry[];
};

export const rfiInquiries =
  globalForStore.rfiInquiries ?? (globalForStore.rfiInquiries = []);

export const rfiAuditLogs =
  globalForStore.rfiAuditLogs ?? (globalForStore.rfiAuditLogs = []);

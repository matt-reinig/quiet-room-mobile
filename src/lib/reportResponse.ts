import type { User } from "firebase/auth";
import { API_BASE } from "../config/env";

export const REPORT_RESPONSE_REASONS = [
  { label: "Harmful or unsafe", value: "harmful_or_unsafe" },
  { label: "Inaccurate or misleading", value: "inaccurate_or_misleading" },
  { label: "Inappropriate or offensive", value: "inappropriate_or_offensive" },
  { label: "Other", value: "other" },
] as const;

export type ReportResponseReason = (typeof REPORT_RESPONSE_REASONS)[number]["value"];

type SubmitResponseReportArgs = {
  assistantMessageId?: string;
  assistantMessageIndex: number;
  conversationId: string;
  note?: string;
  reason: ReportResponseReason;
  user: User;
};

export async function submitResponseReport({
  assistantMessageId,
  assistantMessageIndex,
  conversationId,
  note,
  reason,
  user,
}: SubmitResponseReportArgs): Promise<void> {
  const idToken = await user.getIdToken();
  const response = await fetch(`${API_BASE}/api/report-response`, {
    body: JSON.stringify({
      assistantMessageId,
      assistantMessageIndex,
      conversationId,
      note,
      reason,
    }),
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Unable to submit report.");
  }
}

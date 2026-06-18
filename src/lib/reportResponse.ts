import type { User } from "firebase/auth";
import { API_BASE } from "../config/env";

export const REPORT_RESPONSE_REASONS = [
  { label: "Harmful or unsafe", value: "harmful_or_unsafe" },
  { label: "Inaccurate or misleading", value: "inaccurate_or_misleading" },
  { label: "Inappropriate or offensive", value: "inappropriate_or_offensive" },
  { label: "Other", value: "other" },
] as const;

export type ReportResponseReason = (typeof REPORT_RESPONSE_REASONS)[number]["value"];

export const REPORT_RESPONSE_CONTEXT_SCOPES = [
  {
    description: "Reason, note, model, conversation ID, and message ID.",
    label: "Metadata only",
    value: "metadata_only",
  },
  {
    description: "Adds the reported assistant response text.",
    label: "Include this response",
    value: "selected_response",
  },
  {
    description: "Adds the reported response and nearby messages.",
    label: "Include recent context",
    value: "recent_context",
  },
  {
    description: "Shares this whole conversation with reviewers.",
    label: "Include entire conversation",
    value: "full_conversation",
  },
] as const;

export type ReportResponseContextScope =
  (typeof REPORT_RESPONSE_CONTEXT_SCOPES)[number]["value"];

type SubmitResponseReportArgs = {
  assistantMessageId?: string;
  assistantMessageIndex: number;
  conversationId: string;
  contextScope: ReportResponseContextScope;
  note?: string;
  reason: ReportResponseReason;
  user: User;
};

export async function submitResponseReport({
  assistantMessageId,
  assistantMessageIndex,
  conversationId,
  contextScope,
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
      contextScope,
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

import { queueAttendanceSheetSync } from "@/lib/sheetSync";

const AUTO_FORWARD_PREFIX = /^\[Auto-forwarded.*?\]\s*/i;

export function stripAutoForwardPrefix(comment?: string | null) {
  return comment?.replace(AUTO_FORWARD_PREFIX, "").trim() ?? "";
}

export function buildAbsenteeRemark(absenceReason?: string | null, comment?: string | null) {
  const cleanedComment = stripAutoForwardPrefix(comment);
  const parts = [absenceReason?.trim(), cleanedComment].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : null;
}

export async function syncAbsenteeSheet(date: string) {
  const data = await queueAttendanceSheetSync(date, ["sync_absentees"]);
  if (data?.success === false) {
    throw new Error(data.error || data.errors?.[0] || "Absentee sync failed");
  }

  return data;
}
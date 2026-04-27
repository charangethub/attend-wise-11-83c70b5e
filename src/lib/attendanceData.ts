import { supabase } from "@/integrations/supabase/client";

const ATTENDANCE_PAGE_SIZE = 1000;
const STUDENT_ID_CHUNK_SIZE = 100;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function fetchDatasetStudents<T = any>(
  activeSlug: string,
  columns: string,
  options: { onlyEnrolled?: boolean } = {},
): Promise<T[]> {
  // No roll_no filter: students may legitimately have an empty roll number and must still appear.
  // user_id_vedantu is the primary identifier from the source sheet.
  let query: any = supabase.from("students").select(columns).eq("dataset", activeSlug);

  if (options.onlyEnrolled) {
    query = query.eq("enrollment_status", "ENROLLED");
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as T[];
}

type FetchAttendanceOptions = {
  columns: string;
  studentIds: string[];
  exactDate?: string;
  fromDate?: string;
  toDate?: string;
  session?: string;
  statuses?: string[];
};

export async function fetchAttendanceForStudents<T = any>({
  columns,
  studentIds,
  exactDate,
  fromDate,
  toDate,
  session,
  statuses,
}: FetchAttendanceOptions): Promise<T[]> {
  if (studentIds.length === 0) return [];

  const chunkResults: T[][] = [];

  for (const idChunk of chunkArray(studentIds, STUDENT_ID_CHUNK_SIZE)) {
    const rows: T[] = [];
    let from = 0;

    while (true) {
      let query: any = supabase
        .from("attendance")
        .select(columns)
        .in("student_id", idChunk)
        .order("date", { ascending: true })
        .order("student_id", { ascending: true })
        .order("session", { ascending: true })
        .range(from, from + ATTENDANCE_PAGE_SIZE - 1);

      if (exactDate) query = query.eq("date", exactDate);
      if (fromDate) query = query.gte("date", fromDate);
      if (toDate) query = query.lte("date", toDate);
      if (session) query = query.eq("session", session);
      if (statuses?.length) query = query.in("status", statuses);

      const { data, error } = await query;

      if (error) throw error;
      if (!data?.length) break;

      rows.push(...(data as T[]));

      if (data.length < ATTENDANCE_PAGE_SIZE) break;
      from += ATTENDANCE_PAGE_SIZE;
    }

    chunkResults.push(rows);
  }

  return chunkResults.flat();
}

export function getUniqueRemarks(remarks: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      remarks
        .map((remark) => remark?.trim())
        .filter((remark): remark is string => Boolean(remark)),
    ),
  );
}

export function getCombinedRemarkText(...remarks: Array<string | null | undefined>): string {
  return getUniqueRemarks(remarks).join(" | ");
}

export function getSessionRemarkTooltip(amRemark?: string | null, pmRemark?: string | null): string {
  const uniqueRemarks = getUniqueRemarks([amRemark, pmRemark]);

  if (uniqueRemarks.length === 0) return "";
  if (uniqueRemarks.length === 1) return `Remark: ${uniqueRemarks[0]}`;

  return `AM: ${amRemark?.trim() || "—"}\nPM: ${pmRemark?.trim() || "—"}`;
}
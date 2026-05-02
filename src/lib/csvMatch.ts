/**
 * Build a lookup map keyed by BOTH roll_no and user_id_vedantu (uppercased, trimmed).
 * Either column can match; user_id_vedantu wins when both are present in the same row.
 */
export type MatchableStudent = { id: string; roll_no?: string | null; user_id_vedantu?: string | null };

export function buildStudentLookup<T extends MatchableStudent>(students: T[]): Map<string, T> {
  const map = new Map<string, T>();
  // Populate roll_no first
  students.forEach((s) => {
    const r = (s.roll_no || "").trim().toUpperCase();
    if (r) map.set(r, s);
  });
  // Then user_id_vedantu — overrides on collision
  students.forEach((s) => {
    const u = (s.user_id_vedantu || "").trim().toUpperCase();
    if (u) map.set(u, s);
  });
  return map;
}

/**
 * Given a CSV row's column values, attempt to match a student by either
 * the `user_id_vedantu` column (or `user_id`) or the `roll_no` column.
 */
export function findStudentInRow<T extends MatchableStudent>(
  cols: string[],
  headers: string[],
  lookup: Map<string, T>,
): T | undefined {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const userIdx = lower.findIndex((h) => h === "user_id_vedantu" || h === "user_id" || h === "userid");
  const rollIdx = lower.findIndex((h) => h === "roll_no" || h === "rollno");

  if (userIdx >= 0) {
    const v = (cols[userIdx] || "").trim().toUpperCase();
    if (v && lookup.has(v)) return lookup.get(v);
  }
  if (rollIdx >= 0) {
    const v = (cols[rollIdx] || "").trim().toUpperCase();
    if (v && lookup.has(v)) return lookup.get(v);
  }
  return undefined;
}

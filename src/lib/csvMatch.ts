/**
 * Build a lookup map keyed by roll_no, user_id_vedantu, and unique student names.
 * ID-based matches are preferred; name is only a fallback for CSVs exported with rounded IDs.
 */
export type MatchableStudent = { id: string; roll_no?: string | null; user_id_vedantu?: string | null; student_name?: string | null };

const normalizeKey = (value: string | null | undefined) => (value || "").trim().toUpperCase();
const normalizeNameKey = (value: string | null | undefined) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function buildStudentLookup<T extends MatchableStudent>(students: T[]): Map<string, T> {
  const map = new Map<string, T>();
  const nameCounts = new Map<string, number>();
  const idPrefixCounts = new Map<string, number>();

  students.forEach((s) => {
    const name = normalizeNameKey(s.student_name);
    if (name) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    const u = normalizeKey(s.user_id_vedantu);
    if (u && u.length >= 6) {
      const pfx = u.slice(0, -1);
      idPrefixCounts.set(pfx, (idPrefixCounts.get(pfx) || 0) + 1);
    }
  });

  students.forEach((s) => {
    const r = normalizeKey(s.roll_no);
    if (r) map.set(`ROLL:${r}`, s);
  });
  students.forEach((s) => {
    const u = normalizeKey(s.user_id_vedantu);
    if (u) map.set(`USER:${u}`, s);
    if (u && u.length >= 6) {
      const pfx = u.slice(0, -1);
      if (idPrefixCounts.get(pfx) === 1) map.set(`USERPFX:${pfx}`, s);
    }
  });
  students.forEach((s) => {
    const name = normalizeNameKey(s.student_name);
    if (name && nameCounts.get(name) === 1) map.set(`NAME:${name}`, s);
  });
  return map;
}

/**
 * Given a CSV row's column values, attempt to match a student by user ID,
 * roll number, then unique student name as a safe fallback.
 */
export function findStudentInRow<T extends MatchableStudent>(
  cols: string[],
  headers: string[],
  lookup: Map<string, T>,
): T | undefined {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const userIdx = lower.findIndex((h) => h === "user_id_vedantu" || h === "user_id" || h === "userid");
  const rollIdx = lower.findIndex((h) => h === "roll_no" || h === "rollno");
  const nameIdx = lower.findIndex((h) => h === "name" || h === "student_name" || h === "student");

  if (userIdx >= 0) {
    const v = normalizeKey(cols[userIdx]);
    if (v && lookup.has(`USER:${v}`)) return lookup.get(`USER:${v}`);
    // Excel often rounds the last digit of long numeric IDs — try prefix match.
    if (v && v.length >= 6) {
      const pfx = v.slice(0, -1);
      if (lookup.has(`USERPFX:${pfx}`)) return lookup.get(`USERPFX:${pfx}`);
    }
  }
  if (rollIdx >= 0) {
    const v = normalizeKey(cols[rollIdx]);
    if (v && lookup.has(`ROLL:${v}`)) return lookup.get(`ROLL:${v}`);
  }
  if (nameIdx >= 0) {
    const v = normalizeNameKey(cols[nameIdx]);
    if (v && lookup.has(`NAME:${v}`)) return lookup.get(`NAME:${v}`);
  }
  return undefined;
}

/**
 * Parse a CSV date cell into ISO YYYY-MM-DD. Accepts:
 *  - YYYY-MM-DD
 *  - DD-MM-YYYY or DD/MM/YYYY (and single-digit day/month variants)
 * Returns null when the value is empty or unparseable.
 */
export function parseCsvDate(value: string | null | undefined): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmy = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

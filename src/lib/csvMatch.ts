/**
 * Build a lookup map keyed by student-specific identifiers.
 * roll_no is preferred because user_id_vedantu can be shared by siblings/family accounts.
 * Duplicate keys are treated as ambiguous and are not matched automatically.
 */
export type MatchableStudent = { id: string; roll_no?: string | null; user_id_vedantu?: string | null };

function normalizeIdentifier(value?: string | null): string {
  return (value || "").trim().toUpperCase();
}

function addUnique<T>(map: Map<string, T>, ambiguous: Set<string>, key: string, student: T) {
  if (!key) return;
  if (ambiguous.has(key)) return;
  if (map.has(key)) {
    map.delete(key);
    ambiguous.add(key);
    return;
  }
  map.set(key, student);
}

export function buildStudentLookup<T extends MatchableStudent>(students: T[]): Map<string, T> {
  const map = new Map<string, T>();
  const ambiguous = new Set<string>();

  students.forEach((s) => {
    const roll = normalizeIdentifier(s.roll_no);
    if (roll) addUnique(map, ambiguous, `roll:${roll}`, s);
  });

  students.forEach((s) => {
    const userId = normalizeIdentifier(s.user_id_vedantu);
    if (userId) addUnique(map, ambiguous, `user:${userId}`, s);
  });

  return map;
}

/**
 * Given a CSV row's column values, match by roll_no first, then by user_id_vedantu
 * only when that user ID identifies exactly one loaded student.
 */
export function findStudentInRow<T extends MatchableStudent>(
  cols: string[],
  headers: string[],
  lookup: Map<string, T>,
): T | undefined {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const userIdx = lower.findIndex((h) => h === "user_id_vedantu" || h === "user_id" || h === "userid");
  const rollIdx = lower.findIndex((h) => h === "roll_no" || h === "rollno");

  if (rollIdx >= 0) {
    const roll = normalizeIdentifier(cols[rollIdx]);
    const match = roll ? lookup.get(`roll:${roll}`) : undefined;
    if (match) return match;
  }

  if (userIdx >= 0) {
    const userId = normalizeIdentifier(cols[userIdx]);
    const match = userId ? lookup.get(`user:${userId}`) : undefined;
    if (match) return match;
  }

  return undefined;
}

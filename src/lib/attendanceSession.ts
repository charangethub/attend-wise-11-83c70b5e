/**
 * Combine AM and PM attendance statuses into a display string.
 * Rules:
 *   AM:P + PM:P   = "P"
 *   AM:A + PM:A   = "A"
 *   AM:L + PM:L   = "L"
 *   AM:H + PM:H   = "H"
 *   AM:P + PM:A   = "H" (half day with permission)
 *   AM:A + PM:P   = "H" (half day with permission)
 *   Otherwise      = "AM:PM" e.g. "P:L", "L:P"
 */
export function getCombinedStatus(amStatus?: string, pmStatus?: string): string {
  const am = amStatus || "";
  const pm = pmStatus || "";

  if (!am && !pm) return "";
  if (am && !pm) return am;
  if (!am && pm) return pm;

  if (am === pm) return am;

  // Half day: one P and one A means permission-based half day
  if ((am === "P" && pm === "A") || (am === "A" && pm === "P")) return "H";

  // If either is L, return L
  if (am === "L" || pm === "L") return "L";

  // Use short labels
  const shortLabel = (s: string) => s;

  return `${shortLabel(am)}:${shortLabel(pm)}`;
}

/**
 * Get color classes for a combined status string.
 */
export function getCombinedStatusColor(status: string): string {
  if (!status) return "";
  switch (status) {
    case "P": return "bg-success/20 text-success";
    case "A": return "bg-destructive/20 text-destructive";
    case "L": return "bg-warning/20 text-warning";
    case "H": return "bg-purple-200 text-purple-700";
    default:
      if (status.includes("L")) return "bg-warning/20 text-warning";
      if (status.includes("A")) return "bg-orange-200 text-orange-700";
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Get badge color classes for combined status.
 */
export function getCombinedStatusBadge(status: string): string {
  if (!status) return "bg-muted text-muted-foreground";
  switch (status) {
    case "P": return "bg-success text-success-foreground";
    case "A": return "bg-destructive text-destructive-foreground";
    case "L": return "bg-warning text-warning-foreground";
    case "H": return "bg-purple-600 text-primary-foreground";
    default:
      if (status.startsWith("P:")) return "bg-orange-500 text-white";
      if (status.includes("L")) return "bg-warning text-warning-foreground";
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Combine AM and PM attendance statuses into a display string.
 * Rules:
 *   AM:P + PM:P   = "P"
 *   AM:AB + PM:AB  = "AB"
 *   AM:L + PM:L    = "L"
 *   AM:H + PM:H    = "H"
 *   Otherwise      = "AM:PM" e.g. "P:A", "P:L", "A:P", "L:P"
 */
export function getCombinedStatus(amStatus?: string, pmStatus?: string): string {
  const am = amStatus || "";
  const pm = pmStatus || "";

  if (!am && !pm) return "";
  if (am && !pm) return am; // only morning marked
  if (!am && pm) return pm; // only afternoon marked

  if (am === pm) return am; // both same

  // Use short labels: P, A, L, H
  const shortLabel = (s: string) => {
    if (s === "AB") return "A";
    return s; // P, L, H stay as is
  };

  return `${shortLabel(am)}:${shortLabel(pm)}`;
}

/**
 * Get color classes for a combined status string.
 */
export function getCombinedStatusColor(status: string): string {
  if (!status) return "";
  switch (status) {
    case "P": return "bg-success/20 text-success";
    case "AB": return "bg-destructive/20 text-destructive";
    case "L": return "bg-warning/20 text-warning";
    case "H": return "bg-purple-200 text-purple-700";
    default:
      // Combined like P:A, P:L, A:P, L:P etc.
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
    case "AB": return "bg-destructive text-destructive-foreground";
    case "L": return "bg-warning text-warning-foreground";
    case "H": return "bg-purple-600 text-primary-foreground";
    default:
      if (status.startsWith("P:")) return "bg-orange-500 text-white";
      if (status.includes("L")) return "bg-warning text-warning-foreground";
      return "bg-muted text-muted-foreground";
  }
}

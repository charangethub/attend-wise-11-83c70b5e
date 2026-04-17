/**
 * Combine AM and PM attendance statuses into a display string.
 * H = Holiday (school closed). Single-session is the primary mode now.
 */
export function getCombinedStatus(amStatus?: string, pmStatus?: string): string {
  const am = amStatus || "";
  const pm = pmStatus || "";

  if (!am && !pm) return "";
  if (am && !pm) return am;
  if (!am && pm) return pm;

  if (am === pm) return am;

  // If either is L (leave/permission), return L
  if (am === "L" || pm === "L") return "L";
  // If either is H (holiday), return H
  if (am === "H" || pm === "H") return "H";

  return `${am}:${pm}`;
}

export function getCombinedStatusColor(status: string): string {
  if (!status) return "";
  switch (status) {
    case "P": return "bg-success/20 text-success";
    case "A": return "bg-destructive/20 text-destructive";
    case "L": return "bg-warning/20 text-warning";
    case "H": return "bg-blue-200 text-blue-700"; // Holiday
    default:
      if (status.includes("L")) return "bg-warning/20 text-warning";
      if (status.includes("A")) return "bg-orange-200 text-orange-700";
      return "bg-muted text-muted-foreground";
  }
}

export function getCombinedStatusBadge(status: string): string {
  if (!status) return "bg-muted text-muted-foreground";
  switch (status) {
    case "P": return "bg-success text-success-foreground";
    case "A": return "bg-destructive text-destructive-foreground";
    case "L": return "bg-warning text-warning-foreground";
    case "H": return "bg-blue-600 text-primary-foreground"; // Holiday
    default:
      if (status.startsWith("P:")) return "bg-orange-500 text-white";
      if (status.includes("L")) return "bg-warning text-warning-foreground";
      return "bg-muted text-muted-foreground";
  }
}

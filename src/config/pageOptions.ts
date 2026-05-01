export const PAGE_OPTIONS = [
  "Dashboard",
  "Mark Attendance",
  "Absentee Report",
  "Attendance Records",
  "Daily Report",
  "Permission Entry",
  "Student Calendar",
  "Inventory",
  "Distribution Status",
  "Results Dashboard",
  "Quarterly Marks",
  "Half Yearly Marks",
  "Pre-Final 1 Marks",
  "Pre-Final 2 Marks",
] as const;

export type PageName = (typeof PAGE_OPTIONS)[number];

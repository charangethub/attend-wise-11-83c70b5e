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
] as const;

export type PageName = (typeof PAGE_OPTIONS)[number];

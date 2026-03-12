export const PAGE_OPTIONS = [
  "Dashboard",
  "Mark Attendance",
  "Absentee Report",
  "Attendance Records",
  "Daily Report",
] as const;

export type PageName = (typeof PAGE_OPTIONS)[number];

## Goal
Make the attendance CSV upload accept the `Date` column from the uploaded file (e.g. `18-06-2026`) and use that exact date when writing rows, instead of falling back to today / the selected date.

## Problem
The CSV template the user is using has a `Date` column in `DD-MM-YYYY` format. The current upload handlers only accept `YYYY-MM-DD`, so every row fails the date regex check and rows get skipped (or rewritten to today's date).

## Changes

### 1. `src/lib/csvMatch.ts`
Add and export a small helper `parseCsvDate(value)` that accepts:
- `DD-MM-YYYY` and `DD/MM/YYYY` (the format in the uploaded sheet)
- `YYYY-MM-DD` (already-normalized ISO)
- `D-M-YYYY` variants (single-digit day/month)

Returns a normalized `YYYY-MM-DD` string, or `null` if unparseable.

### 2. `src/pages/AttendanceRecords.tsx`
- Import the new `parseCsvDate` helper.
- In `handleCsvUpload`, replace the raw `cols[dateIdx]` read and the `/^\d{4}-\d{2}-\d{2}$/` validation with a `parseCsvDate(...)` call.
- If the CSV has a `Date` column and it parses → use that exact date per row.
- If the cell is empty / column missing → fall back to today (existing behavior).
- If the cell has a value but can't be parsed → skip the row with a clear "invalid date" reason.
- Update the `CsvUploadDialog` description text to mention that `DD-MM-YYYY` is accepted.

### 3. `src/pages/AttendanceDashboard.tsx`
- Same parsing change inside `handleAttendanceCsvUpload` (around line 345): use `parseCsvDate` on the date cell, fall back to `selectedDate` only when missing/empty.
- Keep the "refresh UI only if uploaded date matches `selectedDate`" guard intact.
- Update the `CsvUploadDialog` description to mention `DD-MM-YYYY` is accepted.

### 4. Sheet sync
No change needed — `queueAttendanceSheetSync(date)` is already called for every distinct date in the upload, so rows uploaded for `18-06-2026` will sync to the `Absent 18 Jun 2026` tab automatically.

## Out of scope
- Template files stay as they are (already show `date` column).
- No DB schema or RLS changes.
- No change to the manual single-day Mark Attendance flow.
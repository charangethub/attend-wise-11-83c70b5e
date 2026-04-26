import { useState, useEffect, useMemo, useCallback } from "react";
import { getDaysInMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, BarChart3, Search, Upload } from "lucide-react";
import { usePageDataset } from "@/hooks/usePageDataset";
import { useAuth } from "@/contexts/AuthContext";
import { getCombinedStatus, getCombinedStatusColor } from "@/lib/attendanceSession";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents, getSessionRemarkTooltip } from "@/lib/attendanceData";
import { toast } from "sonner";
import CsvUploadDialog from "@/components/CsvUploadDialog";
import { buildStudentLookup, findStudentInRow } from "@/lib/csvMatch";
import { parseCsv, normalizeHeader } from "@/lib/csvParse";
import { queueAttendanceSheetSync } from "@/lib/sheetSync";

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const AttendanceRecords = () => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [enrollmentFilter, setEnrollmentFilter] = useState("ENROLLED");
  const [searchQuery, setSearchQuery] = useState("");
  const { datasetSlug: activeSlug } = usePageDataset("Attendance Records");
  const { userRole } = useAuth();
  const isOwner = userRole === "owner";
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  const daysInMonth = getDaysInMonth(new Date(year, month));
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const downloadAttendanceTemplate = () => {
    const header = ["user_id_vedantu", "roll_no", "date", "status", "remark"].join(",");
    const sample1 = ["VED-001", "ROLL001", "2026-04-15", "P", ""].join(",");
    const sample2 = ["", "ROLL002", "2026-04-15", "A", "Sick"].join(",");
    const csv = `${header}\n${sample1}\n${sample2}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "attendance_upload_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleAttendanceCsvUpload = async (file: File) => {
    setCsvUploading(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error("CSV must have header + data rows"); setCsvUploading(false); return; }

      const headers = rows[0].map((h) => normalizeHeader(h));
      const dateIdx = headers.indexOf("date");
      const statusIdx = headers.indexOf("status");
      const remarkIdx = headers.indexOf("remark");
      const hasIdent = headers.some(h => ["roll_no", "rollno", "user_id_vedantu", "user_id", "userid"].includes(h));

      if (dateIdx === -1 || statusIdx === -1) {
        toast.error("CSV must have date and status columns");
        setCsvUploading(false); return;
      }
      if (!hasIdent) {
        toast.error("CSV must include either roll_no or user_id_vedantu");
        setCsvUploading(false); return;
      }

      const lookup = buildStudentLookup(students as any);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const upserts: any[] = [];
      const skippedReasons: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].map((c) => (c ?? "").trim());
        const matched = findStudentInRow(cols, headers, lookup);
        if (!matched) { skippedReasons.push(`Row ${i + 1}: no matching student`); continue; }
        const date = cols[dateIdx];
        const status = (cols[statusIdx] || "").toUpperCase();
        const remark = remarkIdx >= 0 ? cols[remarkIdx] || "" : "";
        if (!["P", "A", "L", "H"].includes(status)) { skippedReasons.push(`Row ${i + 1}: invalid status "${status}"`); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skippedReasons.push(`Row ${i + 1}: invalid date "${date}"`); continue; }

        upserts.push({
          student_id: matched.id,
          date,
          session: "AM",
          status,
          remark,
          marked_by: authUser?.id,
        });
      }

      if (upserts.length === 0) {
        console.warn("Attendance CSV: no valid rows.", skippedReasons);
        toast.error(`No valid rows found. ${skippedReasons.slice(0, 3).join(" • ")}`);
        setCsvUploading(false); return;
      }

      for (let i = 0; i < upserts.length; i += 50) {
        const { error } = await supabase.from("attendance").upsert(
          upserts.slice(i, i + 50) as any,
          { onConflict: "student_id,date,session" }
        );
        if (error) throw error;
      }

      toast.success(`Uploaded ${upserts.length} attendance records (${skippedReasons.length} skipped)`);
      if (skippedReasons.length > 0) console.info("Skipped rows:", skippedReasons);
      setCsvUploadOpen(false);
      fetchData();
      Array.from(new Set(upserts.map((row) => row.date))).forEach((date) => {
        void queueAttendanceSheetSync(date).catch((err) => console.warn("CSV attendance sheet sync failed:", err));
      });
    } catch (err: any) { toast.error("Upload failed: " + err.message); }
    setCsvUploading(false);
  };

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);

    try {
      const studentRows = await fetchDatasetStudents<any>(activeSlug, "id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status, user_id_vedantu");
      const attendanceRows = await fetchAttendanceForStudents<any>({
        columns: "student_id, date, status, session, remark",
        studentIds: studentRows.map((student) => student.id),
        fromDate: monthStart,
        toDate: monthEnd,
      });

      setStudents(studentRows);
      setAttendance(attendanceRows);
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd, activeSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug),
    channelKey: `attendance-records:${activeSlug}:${monthStart}`,
    onRefresh: fetchData,
    fromDate: monthStart,
    toDate: monthEnd,
    debounceMs: 500,
  });

  const classrooms = useMemo(() => Array.from(new Set(students.map((s: any) => s.classroom_name).filter(Boolean))).sort(), [students]);

  const attMap = useMemo(() => {
    const map: Record<string, Record<number, { AM?: string; PM?: string; amRemark?: string; pmRemark?: string }>> = {};
    attendance.forEach((a: any) => {
      if (!map[a.student_id]) map[a.student_id] = {};
      const day = parseInt(a.date.split("-")[2]);
      if (!map[a.student_id][day]) map[a.student_id][day] = {};
      const session = a.session || "AM";
      if (session === "AM") {
        map[a.student_id][day].AM = a.status;
        map[a.student_id][day].amRemark = a.remark;
      } else {
        map[a.student_id][day].PM = a.status;
        map[a.student_id][day].pmRemark = a.remark;
      }
    });
    return map;
  }, [attendance]);

  const filteredStudents = useMemo(() => students.filter((s: any) => {
    if (enrollmentFilter !== "all" && s.enrollment_status !== enrollmentFilter) return false;
    if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
    if (searchQuery) { const q = searchQuery.toLowerCase(); if (!s.student_name.toLowerCase().includes(q) && !s.roll_no.toLowerCase().includes(q)) return false; }
    return true;
  }).sort((a: any, b: any) => a.roll_no.localeCompare(b.roll_no)), [students, enrollmentFilter, classroomFilter, searchQuery]);

  const getStudentSummary = (studentId: string) => {
    const days = attMap[studentId] || {};
    let p = 0, a = 0, l = 0, h = 0, half = 0;
    Object.values(days).forEach((d) => {
      const combined = getCombinedStatus(d.AM, d.PM);
      if (combined === "P") p++;
      else if (combined === "A") a++;
      else if (combined === "L") l++;
      else if (combined === "H") h++;
      else half++;
    });
    const total = p + a + l + h + half;
    return { p, a, l, h, half, total, pct: total > 0 ? Math.round((p / total) * 100) : 0 };
  };

  const statusBadgeColor = (status: string) => {
    switch (status) { case "ENROLLED": return "bg-success/10 text-success"; case "FORFEITED": return "bg-destructive/10 text-destructive"; default: return "bg-muted text-muted-foreground"; }
  };

  const exportCSV = () => {
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"));
    const headers = ["Roll No", "User ID", "Student Name", "Curriculum", "Grade", "Classroom", "Enrollment", ...dayHeaders, "P", "A", "L", "H", "Half", "Total", "%"];
    const rows = filteredStudents.map((s: any) => {
      const days = attMap[s.id] || {};
      const sum = getStudentSummary(s.id);
      return [s.roll_no, s.user_id_vedantu || "", s.student_name, s.curriculum, s.grade, s.classroom_name, s.enrollment_status,
        ...dayHeaders.map((_, i) => { const d = days[i + 1]; return d ? getCombinedStatus(d.AM, d.PM) : ""; }),
        sum.p, sum.a, sum.l, sum.h, sum.half, sum.total, sum.pct];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `attendance-${months[month]}-${year}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full px-4 py-6 max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Attendance Records</h2><p className="text-sm text-muted-foreground">{months[month]} {year} • {filteredStudents.length} students</p></div>
        <div className="flex gap-2">
          {isOwner && <Button variant="outline" size="sm" onClick={() => setCsvUploadOpen(true)} className="gap-1.5"><Upload className="h-4 w-4" /> Upload CSV</Button>}
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent></Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger><SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Enrollment</SelectItem><SelectItem value="ENROLLED">ENROLLED</SelectItem><SelectItem value="FORFEITED">FORFEITED</SelectItem></SelectContent></Select>
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium text-muted-foreground">Legend:</span>
        <span className="rounded px-2 py-0.5 bg-success/20 text-success font-bold">P = Present</span>
        <span className="rounded px-2 py-0.5 bg-destructive/20 text-destructive font-bold">A = Absent</span>
        <span className="rounded px-2 py-0.5 bg-warning/20 text-warning font-bold">L = Leave / Permission</span>
        <span className="rounded px-2 py-0.5 bg-blue-200 text-blue-700 font-bold">H = Holiday</span>
      </div>

      {loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : (
        <TooltipProvider>
          <div className="rounded-lg border border-border overflow-auto max-h-[calc(100vh-280px)] relative">
            <table className="text-xs border-separate border-spacing-0 w-max min-w-full">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-40 bg-muted px-2 py-2 text-left font-semibold min-w-[80px] border-b border-border">Roll No</th>
                  {isOwner && <th className="sticky top-0 z-40 bg-muted px-2 py-2 text-left font-semibold min-w-[90px] border-b border-border" style={{ left: 80 }}>User ID</th>}
                  <th className="sticky top-0 z-40 bg-muted px-2 py-2 text-left font-semibold min-w-[140px] border-b border-border" style={{ left: isOwner ? 170 : 80 }}>Name</th>
                  <th className="sticky top-0 z-40 bg-muted px-2 py-2 text-left font-semibold min-w-[80px] border-b border-border" style={{ left: isOwner ? 310 : 220 }}>Curriculum</th>
                  <th className="sticky top-0 z-40 bg-muted px-2 py-2 text-center font-semibold min-w-[55px] border-b border-border shadow-[2px_0_4px_-1px_hsl(var(--border))]" style={{ left: isOwner ? 390 : 300 }}>Grade</th>
                  <th className="sticky top-0 z-30 bg-muted px-2 py-2 text-left font-semibold min-w-[140px] border-b border-border">Classroom</th>
                  <th className="sticky top-0 z-30 bg-muted px-2 py-2 text-center font-semibold min-w-[80px] border-b border-border">Status</th>
                  {Array.from({ length: daysInMonth }, (_, i) => <th key={i} className="sticky top-0 z-30 bg-muted px-1.5 py-2 text-center font-semibold min-w-[36px] border-b border-border">{String(i + 1).padStart(2, "0")}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s: any, idx: number) => {
                  const days = attMap[s.id] || {};
                  const rowBg = idx % 2 === 0 ? "bg-card" : "bg-muted/40";
                  return (
                    <tr key={s.id}>
                      <td className={`sticky left-0 z-20 ${rowBg} px-2 py-1.5 font-medium border-b border-border`}>{s.roll_no}</td>
                      {isOwner && <td className={`sticky z-20 ${rowBg} px-2 py-1.5 text-muted-foreground text-[10px] font-mono truncate max-w-[90px] border-b border-border`} style={{ left: 80 }} title={s.user_id_vedantu}>{s.user_id_vedantu || "—"}</td>}
                      <td className={`sticky z-20 ${rowBg} px-2 py-1.5 truncate max-w-[140px] border-b border-border`} style={{ left: isOwner ? 170 : 80 }}>{s.student_name}</td>
                      <td className={`sticky z-20 ${rowBg} px-2 py-1.5 text-muted-foreground border-b border-border`} style={{ left: isOwner ? 310 : 220 }}>{s.curriculum}</td>
                      <td className={`sticky z-20 ${rowBg} px-2 py-1.5 text-center text-muted-foreground border-b border-border shadow-[2px_0_4px_-1px_hsl(var(--border))]`} style={{ left: isOwner ? 390 : 300 }}>{s.grade}</td>
                      <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[140px] border-b border-border">{s.classroom_name}</td>
                      <td className="px-2 py-1.5 text-center border-b border-border"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeColor(s.enrollment_status)}`}>{s.enrollment_status}</span></td>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const d = days[i + 1];
                        const combined = d ? getCombinedStatus(d.AM, d.PM) : "";
                        const remarkText = getSessionRemarkTooltip(d?.amRemark, d?.pmRemark);
                        return (
                          <td key={i} className={`px-1 py-1.5 text-center font-semibold border-b border-border ${combined ? getCombinedStatusColor(combined) : ""}`}>
                            {combined ? (
                              remarkText ? (
                                <Tooltip>
                                  <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">{combined}</span></TooltipTrigger>
                                  <TooltipContent className="max-w-[200px] whitespace-pre-line text-xs">{remarkText}</TooltipContent>
                                </Tooltip>
                              ) : combined
                            ) : <span className="text-muted-foreground/30">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

      {/* CSV Upload Dialog */}
      <CsvUploadDialog
        open={csvUploadOpen}
        onOpenChange={setCsvUploadOpen}
        title="Upload Attendance CSV"
        description="Upload a CSV to bulk import attendance records."
        onDownloadTemplate={downloadAttendanceTemplate}
        onUpload={handleAttendanceCsvUpload}
        uploading={csvUploading}
        helpText={
          <>
            <p><strong>Columns:</strong> user_id_vedantu (preferred) or roll_no, date (YYYY-MM-DD), status (P/A/L/H), remark (optional)</p>
            <p>Students are matched by user_id_vedantu first, then roll_no. Invalid rows are skipped.</p>
          </>
        }
      />
    </div>
  );
};
export default AttendanceRecords;

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, CalendarDays } from "lucide-react";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { getCombinedStatus } from "@/lib/attendanceSession";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const STATUS_COLORS: Record<string, string> = {
  P: "bg-green-100 text-green-800",
  AB: "bg-red-100 text-red-600",
  A: "bg-red-100 text-red-600",
  L: "bg-blue-100 text-blue-700",
  H: "bg-purple-100 text-purple-700",
  O: "bg-gray-100 text-gray-500",
  R: "bg-gray-200 text-gray-500",
};

function getStatusColor(status: string): string {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status];
  if (status.includes(":")) return "bg-orange-100 text-orange-700";
  return "bg-muted text-muted-foreground";
}

const StudentCalendarReport = () => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [enrollmentFilter, setEnrollmentFilter] = useState("ENROLLED");
  const [searchQuery, setSearchQuery] = useState("");
  const { activeSlug } = useActiveDataset();

  const currentDate = new Date(year, month);
  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

  useEffect(() => {
    const fetchData = async () => {
      if (!activeSlug) return;
      setLoading(true);
      const [stuRes, attRes] = await Promise.all([
        supabase.from("students").select("id, roll_no, student_name, classroom_name, enrollment_status, grade").neq("roll_no", "").eq("dataset", activeSlug),
        supabase.from("attendance").select("student_id, date, status, session, remark").gte("date", monthStart).lte("date", monthEnd),
      ]);
      setStudents(stuRes.data ?? []);
      setAttendance(attRes.data ?? []);
      setLoading(false);
    };
    fetchData();
  }, [monthStart, monthEnd, activeSlug]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s) => s.classroom_name).filter(Boolean))).sort(), [students]);

  const filteredStudents = useMemo(() => students.filter((s) => {
    if (enrollmentFilter !== "all" && s.enrollment_status !== enrollmentFilter) return false;
    if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.student_name.toLowerCase().includes(q) && !s.roll_no.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a: any, b: any) => a.student_name.localeCompare(b.student_name)), [students, enrollmentFilter, classroomFilter, searchQuery]);

  // Build attendance map for selected student
  const studentAttMap = useMemo(() => {
    if (!selectedStudentId) return {};
    const map: Record<string, { AM?: string; PM?: string; amRemark?: string; pmRemark?: string }> = {};
    attendance.filter((a) => a.student_id === selectedStudentId).forEach((a) => {
      if (!map[a.date]) map[a.date] = {};
      const session = a.session || "AM";
      if (session === "AM") { map[a.date].AM = a.status; map[a.date].amRemark = a.remark; }
      else { map[a.date].PM = a.status; map[a.date].pmRemark = a.remark; }
    });
    return map;
  }, [attendance, selectedStudentId]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start);
    const blanks = Array.from({ length: startDayOfWeek }, () => null);
    return [...blanks, ...days];
  }, [month, year]);

  const selectedStudent = filteredStudents.find((s) => s.id === selectedStudentId);

  // Summary counts
  const summary = useMemo(() => {
    let p = 0, ab = 0, l = 0, h = 0, half = 0;
    Object.values(studentAttMap).forEach((d) => {
      const combined = getCombinedStatus(d.AM, d.PM);
      if (combined === "P") p++;
      else if (combined === "AB") ab++;
      else if (combined === "L") l++;
      else if (combined === "H") h++;
      else half++;
    });
    return { p, ab, l, h, half, total: p + ab + l + h + half };
  }, [studentAttMap]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Student Attendance Calendar</h2>
        <p className="text-sm text-muted-foreground">Select a student to view their monthly calendar attendance report</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={classroomFilter} onValueChange={setClassroomFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Enrollment</SelectItem><SelectItem value="ENROLLED">ENROLLED</SelectItem><SelectItem value="FORFEITED">FORFEITED</SelectItem></SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search student..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Student selector */}
      <div className="mb-6">
        <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Select a student to view calendar..." />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {filteredStudents.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.roll_no} — {s.student_name} ({s.classroom_name})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedStudent && (
        <>
          {/* Student info */}
          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <h3 className="text-lg font-bold text-foreground">{selectedStudent.student_name}</h3>
            <p className="text-sm text-muted-foreground">{selectedStudent.classroom_name} · {selectedStudent.grade} · {selectedStudent.enrollment_status}</p>
          </div>

          {/* Month nav */}
          <div className="mb-4 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1"><ChevronLeft className="h-4 w-4" /> Prev</Button>
            <div className="flex items-center gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1">Next <ChevronRight className="h-4 w-4" /></Button>
          </div>

          {/* Calendar Grid */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="text-center py-3 bg-primary/5 font-bold text-lg text-foreground">{MONTHS[month]} {year}</div>
            <div className="grid grid-cols-7">
              {DAY_LABELS.map((d) => (
                <div key={d} className="border-b border-r border-border bg-primary/10 py-2 text-center text-xs font-bold text-primary">{d}</div>
              ))}
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`blank-${i}`} className="border-b border-r border-border min-h-[80px] bg-muted/20" />;
                const dateStr = format(day, "yyyy-MM-dd");
                const dayNum = format(day, "dd");
                const att = studentAttMap[dateStr];
                const combined = att ? getCombinedStatus(att.AM, att.PM) : "";
                const dayOfWeek = getDay(day);
                const isSunday = dayOfWeek === 0;
                const displayStatus = combined || (isSunday ? "O" : "");
                const remark = att?.amRemark || att?.pmRemark || "";

                return (
                  <div key={dateStr} className={`border-b border-r border-border min-h-[80px] p-1.5 ${isSunday && !combined ? "bg-gray-50" : "bg-card"}`}>
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-bold text-foreground">{dayNum}</span>
                      {isSunday && <span className="text-[9px] text-muted-foreground">☐</span>}
                    </div>
                    {displayStatus && (
                      <div className="mt-1 flex justify-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${getStatusColor(displayStatus)}`}>
                          {displayStatus === "AB" ? "A" : displayStatus}
                        </span>
                      </div>
                    )}
                    {remark && (
                      <p className="mt-0.5 text-[9px] text-muted-foreground text-center truncate" title={remark}>{remark}</p>
                    )}
                    {combined && (
                      <p className="mt-0.5 text-[9px] text-muted-foreground text-center">GS</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <h4 className="text-sm font-semibold mb-2">Legends</h4>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-green-100 border border-green-300" /><strong className="text-green-800">P</strong> Present</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-red-100 border border-red-300" /><strong className="text-red-600">A</strong> Absent</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-300" /><strong className="text-gray-500">O</strong> Off Day</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-gray-200 border border-gray-400" /><strong className="text-gray-500">R</strong> Rest Day</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-blue-100 border border-blue-300" /><strong className="text-blue-700">L</strong> Leave</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded bg-orange-100 border border-orange-300" /><strong className="text-orange-700">P:A</strong> Half Day</span>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: "Present", value: summary.p, cls: "text-success" },
              { label: "Absent", value: summary.ab, cls: "text-destructive" },
              { label: "Leave", value: summary.l, cls: "text-blue-600" },
              { label: "Holiday", value: summary.h, cls: "text-purple-600" },
              { label: "Half Day", value: summary.half, cls: "text-orange-600" },
              { label: "Total Days", value: summary.total, cls: "text-foreground" },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {!selectedStudentId && (
        <div className="py-16 text-center text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Select a student above to view their attendance calendar</p>
        </div>
      )}
    </div>
  );
};

export default StudentCalendarReport;

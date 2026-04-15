import { useState, useEffect, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, isFuture } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from "recharts";
import { usePageDataset } from "@/hooks/usePageDataset";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents } from "@/lib/attendanceData";

const COLORS = { P: "hsl(142, 72%, 40%)", AB: "hsl(0, 72%, 51%)", L: "hsl(38, 92%, 50%)" };

const MonthlyAnalytics = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendance, setAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { datasetSlug: activeSlug } = usePageDataset("Dashboard");

  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
      if (!activeSlug) return;

      setLoading(true);

      try {
        const studentRows = await fetchDatasetStudents<any>(activeSlug, "id, classroom_name", { onlyEnrolled: true });
        const studentIds = studentRows.map((student) => student.id);
        const attendanceRows = await fetchAttendanceForStudents<any>({
          columns: "student_id, status, date",
          studentIds,
          fromDate: monthStart,
          toDate: monthEnd,
        });

        setStudents(studentRows);
        setAttendance(attendanceRows);
      } finally {
        setLoading(false);
      }
    }, [activeSlug, monthEnd, monthStart]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug),
    channelKey: `monthly-analytics:${activeSlug}:${monthStart}`,
    onRefresh: fetchData,
    fromDate: monthStart,
    toDate: monthEnd,
    debounceMs: 800,
  });

  const attendanceByDate = useMemo(() => {
    const map: Record<string, { P: number; AB: number; L: number }> = {};

    attendance.forEach((entry) => {
      const key = entry.date;
      if (!map[key]) map[key] = { P: 0, AB: 0, L: 0 };
      if (entry.status === "P") map[key].P++;
      else if (entry.status === "AB") map[key].AB++;
      else if (entry.status === "L") map[key].L++;
    });

    return map;
  }, [attendance]);

  const dailyTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
    return days.filter((d) => !isFuture(d)).map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const counts = attendanceByDate[dateStr] ?? { P: 0, AB: 0, L: 0 };
      const p = counts.P;
      const ab = counts.AB;
      const l = counts.L;
      const total = p + ab + l;
      return { date: format(day, "dd"), fullDate: format(day, "dd MMM"), Present: p, Absent: ab, Leave: l, total, presentPct: total ? Math.round((p / total) * 100) : 0 };
    });
  }, [attendanceByDate, currentMonth]);

  const monthlySummary = useMemo(() => {
    const p = attendance.filter((a) => a.status === "P").length;
    const ab = attendance.filter((a) => a.status === "AB").length;
    const l = attendance.filter((a) => a.status === "L").length;
    const total = attendance.length;
    const daysWithData = new Set(attendance.map((a) => a.date)).size;
    return { total, present: p, absent: ab, leave: l, daysTracked: daysWithData, avgPresent: total ? Math.round((p / total) * 100) : 0, avgAbsent: total ? Math.round((ab / total) * 100) : 0, avgLeave: total ? Math.round((l / total) * 100) : 0 };
  }, [attendance]);

  const studentClassroomMap = useMemo(
    () => new Map(students.map((student) => [student.id, student.classroom_name || "Unknown"])),
    [students],
  );

  const classroomMonthly = useMemo(() => {
    const map: Record<string, { P: number; AB: number; L: number; total: number }> = {};
    students.forEach((s) => { const n = s.classroom_name || "Unknown"; if (!map[n]) map[n] = { P: 0, AB: 0, L: 0, total: 0 }; });
    attendance.forEach((a) => {
      const n = studentClassroomMap.get(a.student_id) || "Unknown";
      if (!map[n]) map[n] = { P: 0, AB: 0, L: 0, total: 0 };
      map[n].total++;
      if (a.status === "P") map[n].P++;
      else if (a.status === "AB") map[n].AB++;
      else if (a.status === "L") map[n].L++;
    });
    return Object.entries(map).map(([name, d]) => ({
      name: name.length > 22 ? name.slice(0, 19) + "…" : name, fullName: name,
      presentPct: d.total ? Math.round((d.P / d.total) * 100) : 0,
      absentPct: d.total ? Math.round((d.AB / d.total) * 100) : 0,
      Present: d.P, Absent: d.AB, Leave: d.L, total: d.total,
    })).sort((a, b) => b.presentPct - a.presentPct);
  }, [attendance, studentClassroomMap, students]);

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Monthly Statistics</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[120px] text-center text-sm font-semibold">{format(currentMonth, "MMMM yyyy")}</span>
          <Button variant="outline" size="icon" onClick={() => { const next = addMonths(currentMonth, 1); if (!isFuture(startOfMonth(next))) setCurrentMonth(next); }} className="h-8 w-8" disabled={isFuture(startOfMonth(addMonths(currentMonth, 1)))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[{ label: "Days Tracked", value: monthlySummary.daysTracked, cls: "text-foreground" }, { label: "Total Records", value: monthlySummary.total, cls: "text-foreground" }, { label: "Avg Present", value: `${monthlySummary.avgPresent}%`, cls: "text-success" }, { label: "Avg Absent", value: `${monthlySummary.avgAbsent}%`, cls: "text-destructive" }, { label: "Avg Leave", value: `${monthlySummary.avgLeave}%`, cls: "text-warning" }].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`text-2xl font-bold ${card.cls}`}>{card.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Daily Attendance Trend</h4>
        {dailyTrend.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No attendance data for this month</p> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return <div className="rounded-lg border border-border bg-card p-3 shadow-lg"><p className="text-xs font-bold">{d.fullDate}</p><p className="text-xs text-success">Present: {d.Present} ({d.presentPct}%)</p><p className="text-xs text-destructive">Absent: {d.Absent}</p><p className="text-xs text-warning">Leave: {d.Leave}</p></div>;
              }} />
              <Legend />
              <Line type="monotone" dataKey="Present" stroke={COLORS.P} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="Absent" stroke={COLORS.AB} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="Leave" stroke={COLORS.L} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Classroom-wise Monthly Attendance %</h4>
        {classroomMonthly.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No data</p> : (
          <ResponsiveContainer width="100%" height={Math.max(250, classroomMonthly.length * 40)}>
            <BarChart data={classroomMonthly} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return <div className="rounded-lg border border-border bg-card p-3 shadow-lg"><p className="text-xs font-bold">{d.fullName}</p><p className="text-xs text-success">Present: {d.Present} ({d.presentPct}%)</p><p className="text-xs text-destructive">Absent: {d.Absent} ({d.absentPct}%)</p><p className="text-xs text-warning">Leave: {d.Leave}</p></div>;
              }} />
              <Bar dataKey="presentPct" name="Present %" radius={[0, 4, 4, 0]}>
                {classroomMonthly.map((entry, i) => <Cell key={i} fill={entry.presentPct >= 80 ? COLORS.P : entry.presentPct >= 60 ? COLORS.L : COLORS.AB} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default MonthlyAnalytics;

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { Users, UserCheck, UserX, Clock, UserPlus, UserMinus, AlertCircle, BarChart3, UsersRound } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { getCombinedStatus } from "@/lib/attendanceSession";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents } from "@/lib/attendanceData";
import ZeroYTDModal from "./ZeroYTDModal";

const COLORS = { P: "hsl(142, 72%, 40%)", AB: "hsl(0, 72%, 51%)", L: "hsl(38, 92%, 50%)", Half: "hsl(25, 95%, 53%)", Unmarked: "hsl(30, 15%, 70%)" };

const DashboardAnalytics = () => {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const { activeSlug } = useActiveDataset();

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;

    setLoading(true);

    try {
      const studentRows = await fetchDatasetStudents<any>(activeSlug, "id, classroom_name, enrollment_status");
      const studentIds = studentRows.map((student) => student.id);

      const [todayAttendance, weekAttendance] = await Promise.all([
        fetchAttendanceForStudents<any>({ columns: "student_id, status, session, date", studentIds, exactDate: today }),
        fetchAttendanceForStudents<any>({ columns: "student_id, status, session, date", studentIds, fromDate: weekAgo, toDate: today }),
      ]);

      setStudents(studentRows);
      setAttendance(todayAttendance);
      setAllAttendance(weekAttendance);
    } finally {
      setLoading(false);
    }
  }, [activeSlug, today, weekAgo]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug),
    channelKey: `dashboard-attendance-live:${activeSlug}:${today}`,
    onRefresh: fetchData,
    fromDate: weekAgo,
    toDate: today,
    debounceMs: 800,
  });

  // Build per-student combined status for today
  const attMap = useMemo(() => {
    const sessionMap: Record<string, { AM?: string; PM?: string }> = {};
    attendance.forEach((a: any) => {
      if (!sessionMap[a.student_id]) sessionMap[a.student_id] = {};
      const session = a.session || "AM";
      if (session === "AM") sessionMap[a.student_id].AM = a.status;
      else sessionMap[a.student_id].PM = a.status;
    });
    const combined: Record<string, string> = {};
    Object.entries(sessionMap).forEach(([sid, s]) => {
      combined[sid] = getCombinedStatus(s.AM, s.PM);
    });
    return combined;
  }, [attendance]);

  const zeroYTDCount = useMemo(() => {
    const enrolledIds = new Set(students.filter(s => s.enrollment_status === "ENROLLED").map(s => s.id));
    const studentsWithAttendance = new Set(allAttendance.filter(a => a.status === "P").map(a => a.student_id));
    return [...enrolledIds].filter(id => !studentsWithAttendance.has(id)).length;
  }, [students, allAttendance]);

  const avgAttendancePct = useMemo(() => {
    const enrolledIds = new Set(students.filter(s => s.enrollment_status === "ENROLLED").map(s => s.id));
    const dateMap: Record<string, Set<string>> = {};
    const datePresentMap: Record<string, Set<string>> = {};
    allAttendance.forEach(a => {
      if (!enrolledIds.has(a.student_id)) return;
      if (!dateMap[a.date]) { dateMap[a.date] = new Set(); datePresentMap[a.date] = new Set(); }
      dateMap[a.date].add(a.student_id);
      if (a.status === "P") datePresentMap[a.date].add(a.student_id);
    });
    const dates = Object.keys(dateMap);
    if (dates.length === 0) return 0;
    const totalPct = dates.reduce((sum, d) => {
      const total = enrolledIds.size || 1;
      const present = datePresentMap[d]?.size || 0;
      return sum + (present / total) * 100;
    }, 0);
    return Math.round(totalPct / dates.length);
  }, [students, allAttendance]);

  const avgWAU = useMemo(() => {
    const enrolledIds = new Set(students.filter(s => s.enrollment_status === "ENROLLED").map(s => s.id));
    if (enrolledIds.size === 0) return 0;
    const activeStudents = new Set(allAttendance.filter(a => a.status === "P" && enrolledIds.has(a.student_id)).map(a => a.student_id));
    return Math.round((activeStudents.size / enrolledIds.size) * 100);
  }, [students, allAttendance]);

  const totalStudents = students.length;
  const enrolledCount = students.filter((s) => s.enrollment_status === "ENROLLED").length;
  const forfeitedCount = students.filter((s) => s.enrollment_status === "FORFEITED").length;
  const presentCount = students.filter((s) => attMap[s.id] === "P").length;
  const absentCount = students.filter((s) => attMap[s.id] === "AB").length;
  const leaveCount = students.filter((s) => attMap[s.id] === "L").length;
  const halfDayCount = students.filter((s) => attMap[s.id] && !["P", "AB", "L", "H", ""].includes(attMap[s.id])).length;
  const unmarkedCount = totalStudents - presentCount - absentCount - leaveCount - halfDayCount;
  const presentPct = totalStudents ? Math.round((presentCount / totalStudents) * 100) : 0;
  const absentPct = totalStudents ? Math.round((absentCount / totalStudents) * 100) : 0;
  const leavePct = totalStudents ? Math.round((leaveCount / totalStudents) * 100) : 0;

  const pieData = [
    { name: "Present", value: presentCount, color: COLORS.P },
    { name: "Absent", value: absentCount, color: COLORS.AB },
    { name: "Leave", value: leaveCount, color: COLORS.L },
    { name: "Half Day", value: halfDayCount, color: COLORS.Half },
    { name: "Unmarked", value: unmarkedCount, color: COLORS.Unmarked },
  ].filter((d) => d.value > 0);

  const classroomData = useMemo(() => {
    const classrooms: Record<string, { total: number; P: number; AB: number; L: number; half: number }> = {};
    students.forEach((s) => {
      const name = s.classroom_name || "Unknown";
      if (!classrooms[name]) classrooms[name] = { total: 0, P: 0, AB: 0, L: 0, half: 0 };
      classrooms[name].total++;
      const status = attMap[s.id];
      if (status === "P") classrooms[name].P++;
      else if (status === "AB") classrooms[name].AB++;
      else if (status === "L") classrooms[name].L++;
      else if (status && status !== "H") classrooms[name].half++;
    });
    return Object.entries(classrooms).map(([name, data]) => ({
      name: name.length > 25 ? name.slice(0, 22) + "…" : name,
      fullName: name,
      Present: data.P, Absent: data.AB, Leave: data.L, HalfDay: data.half,
      total: data.total,
      presentPct: data.total ? Math.round((data.P / data.total) * 100) : 0,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, attMap]);

  const summaryCards = [
    { label: "Total Students", value: totalStudents, icon: Users, color: "bg-primary/10 text-primary" },
    { label: "Total Enrollment", value: enrolledCount, icon: UserPlus, color: "bg-accent/10 text-accent-foreground" },
    { label: "Forfeited", value: forfeitedCount, icon: UserMinus, color: "bg-muted text-muted-foreground" },
    { label: "Present", value: `${presentCount} (${presentPct}%)`, icon: UserCheck, color: "bg-success/10 text-success" },
    { label: "Absent", value: `${absentCount} (${absentPct}%)`, icon: UserX, color: "bg-destructive/10 text-destructive" },
    { label: "On Leave", value: `${leaveCount} (${leavePct}%)`, icon: Clock, color: "bg-warning/10 text-warning" },
  ];

  const insightCards = [
    { label: "Zero YTD Students", value: zeroYTDCount, subtitle: "Students with zero attendance", icon: AlertCircle, color: "text-destructive" },
    { label: "Avg Attendance %", value: `${avgAttendancePct}%`, subtitle: "Scheduled vs Attended", icon: BarChart3, color: "text-primary" },
    { label: "Avg WAU", value: `${avgWAU}%`, subtitle: "Weekly Active Users", icon: UsersRound, color: "text-success" },
  ];

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Today's Snapshot — {format(new Date(), "dd MMM yyyy")}</h3>
        {unmarkedCount > 0 && <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">{unmarkedCount} unmarked</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}><card.icon className="h-5 w-5" /></div>
              <div><p className="text-xs text-muted-foreground">{card.label}</p><p className="text-xl font-bold text-foreground">{card.value}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {insightCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Attendance Distribution</h4>
          {pieData.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Classroom-wise Attendance</h4>
          {classroomData.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p> : (
            <ResponsiveContainer width="100%" height={Math.max(250, classroomData.length * 40)}>
              <BarChart data={classroomData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div className="rounded-lg border border-border bg-card p-3 shadow-lg"><p className="text-xs font-bold">{d.fullName}</p><p className="text-xs text-success">Present: {d.Present}</p><p className="text-xs text-destructive">Absent: {d.Absent}</p><p className="text-xs text-warning">Leave: {d.Leave}</p><p className="text-xs text-orange-600">Half Day: {d.HalfDay}</p><p className="mt-1 text-xs font-semibold">{d.presentPct}%</p></div>;
                }} />
                <Bar dataKey="Present" stackId="a" fill={COLORS.P} />
                <Bar dataKey="Absent" stackId="a" fill={COLORS.AB} />
                <Bar dataKey="Leave" stackId="a" fill={COLORS.L} />
                <Bar dataKey="HalfDay" stackId="a" fill={COLORS.Half} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;

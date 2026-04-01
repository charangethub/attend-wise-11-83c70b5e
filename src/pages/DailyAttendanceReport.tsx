import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { getCombinedStatus } from "@/lib/attendanceSession";

const DailyAttendanceReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: settings } = useSystemSettings();
  const { activeSlug } = useActiveDataset();

  // ✅ FIX (Bug 3): useCallback so fetchData can be used in visibilitychange listener
  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    const [stuRes, attRes] = await Promise.all([
      supabase.from("students").select("id, classroom_name, enrollment_status, center").neq("roll_no", "").eq("enrollment_status", "ENROLLED").eq("dataset", activeSlug),
      supabase.from("attendance").select("student_id, status, session").eq("date", selectedDate)
    ]);
    setStudents(stuRes.data ?? []);
    setAttendance(attRes.data ?? []);
    setLoading(false);
  }, [selectedDate, activeSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ✅ FIX (Bug 3): Refetch when user returns to this tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) void fetchData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchData]);

  const dynamicCenter = useMemo(() => {
    if (settings?.center_name) return settings.center_name;
    const first = students.find((s: any) => s.center);
    return first?.center || "Adilabad";
  }, [students, settings?.center_name]);

  const reportData = useMemo(() => {
    const studentSessions: Record<string, { AM?: string; PM?: string }> = {};
    attendance.forEach((a: any) => {
      if (!studentSessions[a.student_id]) studentSessions[a.student_id] = {};
      const session = a.session || "AM";
      if (session === "AM") studentSessions[a.student_id].AM = a.status;
      else studentSessions[a.student_id].PM = a.status;
    });

    const classMap: Record<string, { strength: number; present: number; absent: number; leave: number; half: number }> = {};
    students.forEach((s) => {
      const name = s.classroom_name || "Unknown";
      if (!classMap[name]) classMap[name] = { strength: 0, present: 0, absent: 0, leave: 0, half: 0 };
      classMap[name].strength++;

      const sessions = studentSessions[s.id];
      if (sessions) {
        const combined = getCombinedStatus(sessions.AM, sessions.PM);
        if (combined === "P") classMap[name].present++;
        else if (combined === "AB") classMap[name].absent++;
        else if (combined === "L") classMap[name].leave++;
        else classMap[name].half++;
      }
    });

    const rows = Object.entries(classMap).map(([name, d]) => ({
      batch: name,
      strength: d.strength,
      present: d.present,
      absent: d.absent + d.leave,
      half: d.half,
      pct: d.strength > 0 ? (d.present / d.strength) * 100 : 0,
    })).sort((a, b) => a.batch.localeCompare(b.batch));
    const totals = rows.reduce((acc, r) => ({ strength: acc.strength + r.strength, present: acc.present + r.present, absent: acc.absent + r.absent, half: acc.half + r.half }), { strength: 0, present: 0, absent: 0, half: 0 });
    return { rows, totals: { ...totals, pct: totals.strength > 0 ? (totals.present / totals.strength) * 100 : 0 } };
  }, [students, attendance]);

  const dateObj = new Date(selectedDate + "T00:00:00");
  const dateLabel = format(dateObj, "dd/MMM/yyyy");
  const changeDate = (dir: number) => { const d = new Date(selectedDate + "T00:00:00"); d.setDate(d.getDate() + dir); setSelectedDate(format(d, "yyyy-MM-dd")); };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Daily Attendance Report</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeDate(-1)} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground" />
          <Button variant="outline" size="icon" onClick={() => changeDate(1)} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 print:hidden"><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>
      {loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : (
        <div className="mx-auto max-w-3xl bg-card shadow-lg print:shadow-none">
          <div className="border-2 border-foreground bg-primary/5 px-6 py-4 text-center">
            <h1 className="text-xl font-extrabold tracking-wide text-primary uppercase">VEDANTU LEARNING CENTRE</h1>
            <p className="text-base font-bold text-destructive">{dynamicCenter}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">DATE&nbsp; {dateLabel}</p>
          </div>
          <table className="w-full border-collapse"><thead><tr className="bg-primary/10">{["Batch", "Strength", "Present", "Absent", "Half Day", "%"].map((h) => <th key={h} className="border-2 border-foreground px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-primary">{h}</th>)}</tr></thead>
            <tbody>{reportData.rows.length === 0 ? <tr><td colSpan={6} className="border-2 border-foreground py-8 text-center text-muted-foreground">No data for this date</td></tr> : reportData.rows.map((row, i) => (
              <tr key={row.batch} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                <td className="border-2 border-foreground px-4 py-2 text-center text-sm font-semibold text-foreground">{row.batch}</td>
                <td className="border-2 border-foreground px-4 py-2 text-center text-foreground">{row.strength}</td>
                <td className="border-2 border-foreground px-4 py-2 text-center font-semibold text-success">{row.present}</td>
                <td className="border-2 border-foreground px-4 py-2 text-center font-semibold text-destructive">{row.absent}</td>
                <td className="border-2 border-foreground px-4 py-2 text-center font-semibold text-orange-600">{row.half}</td>
                <td className="border-2 border-foreground px-4 py-2 text-center font-semibold text-foreground">{row.pct.toFixed(2)}%</td>
              </tr>))}</tbody>
            {reportData.rows.length > 0 && <tfoot><tr className="bg-primary/10 font-bold">
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-sm uppercase text-primary">Total</td>
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-foreground">{reportData.totals.strength}</td>
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-success">{reportData.totals.present}</td>
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-destructive">{reportData.totals.absent}</td>
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-orange-600">{reportData.totals.half}</td>
              <td className="border-2 border-foreground px-4 py-2.5 text-center text-foreground">{reportData.totals.pct.toFixed(2)}%</td>
            </tr></tfoot>}
          </table>
        </div>
      )}
    </div>
  );
};
export default DailyAttendanceReport;

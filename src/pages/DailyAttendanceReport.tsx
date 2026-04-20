import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePageDataset } from "@/hooks/usePageDataset";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, ChevronLeft, ChevronRight, Printer, Filter } from "lucide-react";
import { getCombinedStatus } from "@/lib/attendanceSession";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents } from "@/lib/attendanceData";

const DailyAttendanceReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatches, setSelectedBatches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("dailyReport.selectedBatches");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("dailyReport.selectedBatches", JSON.stringify(selectedBatches)); } catch {}
  }, [selectedBatches]);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: settings } = useSystemSettings();
  const { datasetSlug: activeSlug } = usePageDataset("Daily Report");

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    try {
      const studentRows = await fetchDatasetStudents<any>(activeSlug, "id, classroom_name, enrollment_status, center", { onlyEnrolled: true });
      const attendanceRows = await fetchAttendanceForStudents<any>({
        columns: "student_id, status, session",
        studentIds: studentRows.map((student: any) => student.id),
        exactDate: selectedDate,
      });
      setStudents(studentRows);
      setAttendance(attendanceRows);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, activeSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug),
    channelKey: `daily-report:${activeSlug}:${selectedDate}`,
    onRefresh: fetchData,
    exactDate: selectedDate,
    debounceMs: 500,
  });

  const dynamicCenter = useMemo(() => {
    if (settings?.center_name) return settings.center_name;
    const first = students.find((s: any) => s.center);
    return first?.center || "Adilabad";
  }, [students, settings?.center_name]);

  const allClassrooms = useMemo(() => Array.from(new Set(students.map((s: any) => s.classroom_name).filter(Boolean))).sort(), [students]);

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
      if (selectedBatches.length > 0 && !selectedBatches.includes(name)) return;

      if (!classMap[name]) classMap[name] = { strength: 0, present: 0, absent: 0, leave: 0, half: 0 };
      classMap[name].strength++;

      const sessions = studentSessions[s.id];
      if (sessions) {
        const combined = getCombinedStatus(sessions.AM, sessions.PM);
        if (combined === "P") classMap[name].present++;
        else if (combined === "A") classMap[name].absent++;
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
  }, [students, attendance, selectedBatches]);

  const dateObj = new Date(selectedDate + "T00:00:00");
  const dateLabel = format(dateObj, "dd/MMM/yyyy");
  const changeDate = (dir: number) => { const d = new Date(selectedDate + "T00:00:00"); d.setDate(d.getDate() + dir); setSelectedDate(format(d, "yyyy-MM-dd")); };

  const toggleBatch = (batch: string) => {
    setSelectedBatches(prev => prev.includes(batch) ? prev.filter(b => b !== batch) : [...prev, batch]);
  };

  return (
    <div className="w-full px-4 py-6 max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Daily Attendance Report</h2>
        <div className="flex items-center gap-2">
          {/* Batches Filter Popover */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={selectedBatches.length > 0 ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
              >
                <Filter className="h-4 w-4" />
                Batches
                {selectedBatches.length > 0 && (
                  <span className="ml-1 rounded-full bg-background text-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                    {selectedBatches.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Filter Classrooms</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedBatches([...allClassrooms])}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedBatches([])}
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {allClassrooms.map(c => {
                  const isSelected = selectedBatches.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleBatch(c)}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm text-foreground truncate">{c}</span>
                    </label>
                  );
                })}
                {allClassrooms.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-3">No classrooms found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>

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
          <table className="w-full border-collapse"><thead><tr className="bg-primary/10">{["Batch", "Strength", "Present", "Absent (A)", "Half Day", "%"].map((h) => <th key={h} className="border-2 border-foreground px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-primary">{h}</th>)}</tr></thead>
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

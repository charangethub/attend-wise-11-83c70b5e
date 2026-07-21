import { useState, useEffect, useMemo, useCallback } from "react";
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
  const [permissions, setPermissions] = useState<any[]>([]);
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
  const ALL_COLUMNS = ["Total Enrollment", "Forfeited", "Strength", "Present", "Absent (A)", "Half Day", "Holiday", "%"] as const;
  type ColKey = typeof ALL_COLUMNS[number];
  const [hiddenColumns, setHiddenColumns] = useState<ColKey[]>(() => {
    try {
      const raw = localStorage.getItem("dailyReport.hiddenColumns");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("dailyReport.hiddenColumns", JSON.stringify(hiddenColumns)); } catch {}
  }, [hiddenColumns]);
  const [columnFilterOpen, setColumnFilterOpen] = useState(false);
  const isColVisible = (c: ColKey) => !hiddenColumns.includes(c);
  const toggleColumn = (c: ColKey) => setHiddenColumns(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const { data: settings } = useSystemSettings();
  const { datasetSlug: activeSlug } = usePageDataset("Daily Report");

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    try {
      const studentRows = await fetchDatasetStudents<any>(activeSlug, "id, classroom_name, enrollment_status, center");
      const attendanceRows = await fetchAttendanceForStudents<any>({
        columns: "student_id, status, session",
        studentIds: studentRows
          .filter((student: any) => student.enrollment_status === "ENROLLED")
          .map((student: any) => student.id),
        exactDate: selectedDate,
      });
      const { data: permissionRows, error: permissionError } = await supabase
        .from("student_permissions" as any)
        .select("student_id, permission_type")
        .eq("date", selectedDate)
        .eq("dataset", activeSlug);

      if (permissionError) throw permissionError;

      setStudents(studentRows);
      setAttendance(attendanceRows);
      setPermissions((permissionRows as any[]) ?? []);
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
    watchPermissions: true,
    permissionDataset: activeSlug,
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

    const permissionStudentIds = new Set(permissions.map((permission: any) => permission.student_id).filter(Boolean));
    const classMap: Record<string, { total: number; forfeited: number; strength: number; present: number; absent: number; half: number; holiday: number }> = {};
    students.forEach((s) => {
      const name = s.classroom_name || "Unknown";
      if (selectedBatches.length > 0 && !selectedBatches.includes(name)) return;

      if (!classMap[name]) classMap[name] = { total: 0, forfeited: 0, strength: 0, present: 0, absent: 0, half: 0, holiday: 0 };

      classMap[name].total++;
      if (s.enrollment_status === "FORFEITED") classMap[name].forfeited++;
      if (s.enrollment_status !== "ENROLLED") return;

      // Strength always reflects enrolled students in the batch.
      classMap[name].strength++;

      const sessions = studentSessions[s.id];
      const combined = sessions ? getCombinedStatus(sessions.AM, sessions.PM) : "";
      if (combined === "H") classMap[name].holiday++;
      else if (permissionStudentIds.has(s.id) || combined === "L") classMap[name].half++;
      else if (combined === "P") classMap[name].present++;
      else if (combined === "A") classMap[name].absent++;
      else if (combined) classMap[name].half++;
    });

    const rows = Object.entries(classMap).map(([name, d]) => {
      const denom = Math.max(0, d.strength - d.holiday);
      return {
        batch: name,
        total: d.total,
        forfeited: d.forfeited,
        strength: d.strength,
        present: d.present,
        absent: d.absent,
        half: d.half,
        holiday: d.holiday,
        pct: denom > 0 ? (d.present / denom) * 100 : 0,
      };
    }).sort((a, b) => a.batch.localeCompare(b.batch));
    const totals = rows.reduce((acc, r) => ({ total: acc.total + r.total, forfeited: acc.forfeited + r.forfeited, strength: acc.strength + r.strength, present: acc.present + r.present, absent: acc.absent + r.absent, half: acc.half + r.half, holiday: acc.holiday + r.holiday }), { total: 0, forfeited: 0, strength: 0, present: 0, absent: 0, half: 0, holiday: 0 });
    const totalDenom = Math.max(0, totals.strength - totals.holiday);
    return { rows, totals: { ...totals, pct: totalDenom > 0 ? (totals.present / totalDenom) * 100 : 0 } };
  }, [students, attendance, permissions, selectedBatches]);

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

          {/* Columns Filter Popover */}
          <Popover open={columnFilterOpen} onOpenChange={setColumnFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={hiddenColumns.length > 0 ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
              >
                <Filter className="h-4 w-4" />
                Columns
                {hiddenColumns.length > 0 && (
                  <span className="ml-1 rounded-full bg-background text-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                    {ALL_COLUMNS.length - hiddenColumns.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Filter Columns</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setHiddenColumns([])}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setHiddenColumns([...ALL_COLUMNS])}
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {ALL_COLUMNS.map(c => {
                  const isSelected = isColVisible(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleColumn(c)}
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
        <div className="w-full bg-card shadow-lg print:shadow-none">
          <div className="border-2 border-foreground bg-primary/5 px-6 py-4 text-center">
            <h1 className="text-xl font-extrabold tracking-wide text-primary uppercase">Daily Attendance Report — Vedantu Learning Centre</h1>
            <p className="text-base font-bold text-destructive">{dynamicCenter}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">DATE&nbsp; {dateLabel}</p>
          </div>
          {(() => {
            const visibleCols = ALL_COLUMNS.filter(isColVisible);
            const colSpan = 1 + visibleCols.length;
            const cellCls = "border-2 border-foreground px-4 py-2 text-center";
            const cellFor = (c: ColKey, row: any) => {
              switch (c) {
                case "Total Enrollment": return <td key={c} className={`${cellCls} text-foreground`}>{row.total}</td>;
                case "Forfeited": return <td key={c} className={`${cellCls} font-semibold text-muted-foreground`}>{row.forfeited}</td>;
                case "Strength": return <td key={c} className={`${cellCls} text-foreground`}>{row.strength}</td>;
                case "Present": return <td key={c} className={`${cellCls} font-semibold text-success`}>{row.present}</td>;
                case "Absent (A)": return <td key={c} className={`${cellCls} font-semibold text-destructive`}>{row.absent}</td>;
                case "Half Day": return <td key={c} className={`${cellCls} font-semibold text-orange-600`}>{row.half}</td>;
                case "Holiday": return <td key={c} className={`${cellCls} font-semibold text-blue-600`}>{row.holiday}</td>;
                case "%": return <td key={c} className={`${cellCls} font-semibold text-foreground`}>{row.pct.toFixed(2)}%</td>;
              }
            };
            const totalCellFor = (c: ColKey) => {
              const base = "border-2 border-foreground px-4 py-2.5 text-center";
              switch (c) {
                case "Total Enrollment": return <td key={c} className={`${base} text-foreground`}>{reportData.totals.total}</td>;
                case "Forfeited": return <td key={c} className={`${base} text-muted-foreground`}>{reportData.totals.forfeited}</td>;
                case "Strength": return <td key={c} className={`${base} text-foreground`}>{reportData.totals.strength}</td>;
                case "Present": return <td key={c} className={`${base} text-success`}>{reportData.totals.present}</td>;
                case "Absent (A)": return <td key={c} className={`${base} text-destructive`}>{reportData.totals.absent}</td>;
                case "Half Day": return <td key={c} className={`${base} text-orange-600`}>{reportData.totals.half}</td>;
                case "Holiday": return <td key={c} className={`${base} text-blue-600`}>{reportData.totals.holiday}</td>;
                case "%": return <td key={c} className={`${base} text-foreground`}>{reportData.totals.pct.toFixed(2)}%</td>;
              }
            };
            return (
              <table className="w-full border-collapse table-auto">
                <thead><tr className="bg-primary/10">
                  <th className="border-2 border-foreground px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-primary whitespace-nowrap">Batch</th>
                  {visibleCols.map(h => <th key={h} className="border-2 border-foreground px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-primary whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>{reportData.rows.length === 0 ? <tr><td colSpan={colSpan} className="border-2 border-foreground py-8 text-center text-muted-foreground">No data for this date</td></tr> : reportData.rows.map((row, i) => (
                  <tr key={row.batch} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    <td className="border-2 border-foreground px-4 py-2 text-left text-sm font-semibold text-foreground whitespace-nowrap">{row.batch}</td>
                    {visibleCols.map(c => cellFor(c, row))}
                  </tr>))}</tbody>
                {reportData.rows.length > 0 && <tfoot><tr className="bg-primary/10 font-bold">
                  <td className="border-2 border-foreground px-4 py-2.5 text-left text-sm uppercase text-primary whitespace-nowrap">Total</td>
                  {visibleCols.map(c => totalCellFor(c))}
                </tr></tfoot>}
              </table>
            );
          })()}
        </div>
      )}
    </div>
  );
};
export default DailyAttendanceReport;

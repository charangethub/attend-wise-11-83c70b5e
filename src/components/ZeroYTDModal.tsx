import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { Eye } from "lucide-react";
import CallHistoryDialog from "./CallHistoryDialog";

interface ZeroYTDStudent {
  id: string;
  student_name: string;
  classroom_name: string;
  roll_no: string;
  enrollment_status: string;
  lastPresent?: string;
  expectedReturn?: string;
  absenceReason?: string;
}

interface ZeroYTDModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];   // kept for back-compat (default weekly list)
  allStudents: any[];
}

const ZeroYTDModal = ({ open, onOpenChange, studentIds, allStudents }: ZeroYTDModalProps) => {
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [rangeMode, setRangeMode] = useState<"weekly" | "monthly" | "all">("weekly");
  const today = format(new Date(), "yyyy-MM-dd");
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState<string>(today);
  const [computedIds, setComputedIds] = useState<string[] | null>(null);
  const [lastPresentMap, setLastPresentMap] = useState<Record<string, string>>({});
  const [callLogsMap, setCallLogsMap] = useState<Record<string, any>>({});
  const [historyStudent, setHistoryStudent] = useState<ZeroYTDStudent | null>(null);
  const [loading, setLoading] = useState(false);

  // Update date range whenever the mode toggles
  useEffect(() => {
    const now = new Date();
    if (rangeMode === "weekly") {
      setFromDate(format(subDays(now, 6), "yyyy-MM-dd"));
      setToDate(format(now, "yyyy-MM-dd"));
    } else if (rangeMode === "monthly") {
      setFromDate(format(startOfMonth(now), "yyyy-MM-dd"));
      setToDate(format(endOfMonth(now), "yyyy-MM-dd"));
    } else {
      setFromDate("");
      setToDate(format(now, "yyyy-MM-dd"));
    }
  }, [rangeMode]);

  const enrolledStudents = useMemo(
    () => allStudents.filter((s) => s.enrollment_status === "ENROLLED"),
    [allStudents],
  );

  // Recompute the zero-attendance list from the DB whenever the range changes.
  // For the initial weekly view we use the pre-computed studentIds prop for speed.
  useEffect(() => {
    if (!open) return;
    const isDefaultWeekly =
      rangeMode === "weekly" &&
      fromDate === format(subDays(new Date(), 6), "yyyy-MM-dd") &&
      toDate === today;
    if (isDefaultWeekly) { setComputedIds(null); return; }

    const run = async () => {
      const ids = enrolledStudents.map((s) => s.id);
      if (!ids.length) { setComputedIds([]); return; }
      const present = new Set<string>();
      // chunk to avoid oversized IN() lists
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        let q = supabase.from("attendance").select("student_id").in("student_id", chunk).eq("status", "P");
        if (fromDate) q = q.gte("date", fromDate);
        if (toDate) q = q.lte("date", toDate);
        const { data } = await q;
        (data as any[])?.forEach((r) => present.add(r.student_id));
      }
      setComputedIds(ids.filter((id) => !present.has(id)));
    };
    void run();
  }, [open, rangeMode, fromDate, toDate, enrolledStudents, today]);

  const activeIds = computedIds ?? studentIds;

  const zeroStudents = useMemo(() => {
    const idSet = new Set(activeIds);
    return allStudents
      .filter((s) => idSet.has(s.id))
      .map((s) => ({
        id: s.id,
        student_name: s.student_name,
        classroom_name: s.classroom_name,
        roll_no: s.roll_no,
        enrollment_status: s.enrollment_status,
        lastPresent: lastPresentMap[s.id],
        expectedReturn: callLogsMap[s.id]?.expected_return_date,
        absenceReason: callLogsMap[s.id]?.absence_reason,
      }));
  }, [activeIds, allStudents, lastPresentMap, callLogsMap]);

  const classrooms = useMemo(
    () => Array.from(new Set(zeroStudents.map((s) => s.classroom_name).filter(Boolean))).sort(),
    [zeroStudents],
  );

  const filtered = useMemo(
    () => classroomFilter === "all" ? zeroStudents : zeroStudents.filter((s) => s.classroom_name === classroomFilter),
    [zeroStudents, classroomFilter],
  );

  useEffect(() => {
    if (!open || activeIds.length === 0) return;

    const fetchDetails = async () => {
      setLoading(true);
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < activeIds.length; i += 50) chunks.push(activeIds.slice(i, i + 50));

        const lpMap: Record<string, string> = {};
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data } = await supabase
              .from("attendance")
              .select("student_id, date")
              .in("student_id", chunk)
              .eq("status", "P")
              .order("date", { ascending: false })
              .limit(chunk.length);

            data?.forEach((row: any) => {
              if (!lpMap[row.student_id]) lpMap[row.student_id] = row.date;
            });
          }),
        );
        setLastPresentMap(lpMap);

        const clMap: Record<string, any> = {};
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data } = await supabase
              .from("call_logs" as any)
              .select("student_id, absence_reason, expected_return_date, absent_date")
              .in("student_id", chunk)
              .order("absent_date", { ascending: false })
              .limit(chunk.length * 2);

            (data as any[])?.forEach((row: any) => {
              if (!clMap[row.student_id]) clMap[row.student_id] = row;
            });
          }),
        );
        setCallLogsMap(clMap);
      } finally {
        setLoading(false);
      }
    };

    void fetchDetails();
  }, [open, activeIds]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              Zero YTD Students
              <Badge variant="destructive">{activeIds.length}</Badge>
            </SheetTitle>
            <SheetDescription>
              Students with zero attendance in the selected period.
            </SheetDescription>
          </SheetHeader>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Classroom</Label>
              <Select value={classroomFilter} onValueChange={setClassroomFilter}>
                <SelectTrigger><SelectValue placeholder="All Classrooms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classrooms</SelectItem>
                  {classrooms.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (last 7 days)</SelectItem>
                  <SelectItem value="monthly">Monthly (this month)</SelectItem>
                  <SelectItem value="all">All-time (from start)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={rangeMode === "all"}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No zero attendance students found</p>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left font-semibold">Student Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Roll No</th>
                    <th className="px-3 py-2 text-left font-semibold">Classroom</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                    <th className="px-3 py-2 text-left font-semibold">Last Present</th>
                    <th className="px-3 py-2 text-left font-semibold">Expected Return</th>
                    <th className="px-3 py-2 text-center font-semibold">History</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                      <td className="px-3 py-2 font-medium">{s.student_name}</td>
                      <td className="px-3 py-2">{s.roll_no}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.classroom_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.absenceReason || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.lastPresent ? format(new Date(s.lastPresent + "T00:00:00"), "dd MMM yyyy") : "Never"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.expectedReturn ? format(new Date(s.expectedReturn + "T00:00:00"), "dd MMM yyyy") : "Not Set"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setHistoryStudent(s)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {historyStudent && (
        <CallHistoryDialog
          open={!!historyStudent}
          onOpenChange={(o) => { if (!o) setHistoryStudent(null); }}
          studentId={historyStudent.id}
          studentName={historyStudent.student_name}
        />
      )}
    </>
  );
};

export default ZeroYTDModal;

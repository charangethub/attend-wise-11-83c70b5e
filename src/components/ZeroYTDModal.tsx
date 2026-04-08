import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import CallLogDialog from "./CallLogDialog";

interface ZeroYTDStudent {
  id: string;
  student_name: string;
  classroom_name: string;
  roll_no: string;
  enrollment_status: string;
  lastPresent?: string;
  expectedReturn?: string;
  latestComment?: string;
  latestCallLog?: any;
}

interface ZeroYTDModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  allStudents: any[];
}

const ZeroYTDModal = ({ open, onOpenChange, studentIds, allStudents }: ZeroYTDModalProps) => {
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [lastPresentMap, setLastPresentMap] = useState<Record<string, string>>({});
  const [callLogsMap, setCallLogsMap] = useState<Record<string, any>>({});
  const [callLogStudent, setCallLogStudent] = useState<ZeroYTDStudent | null>(null);
  const [loading, setLoading] = useState(false);

  const zeroStudents = useMemo(() => {
    const idSet = new Set(studentIds);
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
        latestComment: callLogsMap[s.id]?.comment,
        latestCallLog: callLogsMap[s.id],
      }));
  }, [studentIds, allStudents, lastPresentMap, callLogsMap]);

  const classrooms = useMemo(
    () => Array.from(new Set(zeroStudents.map((s) => s.classroom_name).filter(Boolean))).sort(),
    [zeroStudents],
  );

  const filtered = useMemo(
    () => classroomFilter === "all" ? zeroStudents : zeroStudents.filter((s) => s.classroom_name === classroomFilter),
    [zeroStudents, classroomFilter],
  );

  useEffect(() => {
    if (!open || studentIds.length === 0) return;

    const fetchDetails = async () => {
      setLoading(true);
      try {
        // Fetch last present date for each student (latest attendance with P)
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 50) chunks.push(studentIds.slice(i, i + 50));

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

        // Fetch latest call logs
        const clMap: Record<string, any> = {};
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data } = await supabase
              .from("call_logs" as any)
              .select("student_id, comment, expected_return_date, call_status, absence_reason, absent_date")
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
  }, [open, studentIds]);

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              Zero YTD Students
              <Badge variant="destructive">{studentIds.length}</Badge>
            </SheetTitle>
            <SheetDescription>Students with zero attendance in the last 7 days</SheetDescription>
          </SheetHeader>

          <div className="mb-4">
            <Select value={classroomFilter} onValueChange={setClassroomFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Classrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classrooms</SelectItem>
                {classrooms.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No zero attendance students found</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div key={s.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.roll_no} · {s.classroom_name} · {s.enrollment_status}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCallLogStudent(s)}
                      className="text-xs"
                    >
                      Update
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Last Present: <span className="font-medium text-foreground">{s.lastPresent ? format(new Date(s.lastPresent + "T00:00:00"), "dd MMM yyyy") : "Never"}</span></span>
                    <span>Expected Return: <span className="font-medium text-foreground">{s.expectedReturn ? format(new Date(s.expectedReturn + "T00:00:00"), "dd MMM yyyy") : "—"}</span></span>
                  </div>
                  {s.latestComment && (
                    <p className="text-xs text-muted-foreground italic truncate">Remark: {s.latestComment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {callLogStudent && (
        <CallLogDialog
          open={!!callLogStudent}
          onOpenChange={(o) => { if (!o) setCallLogStudent(null); }}
          studentId={callLogStudent.id}
          studentName={callLogStudent.student_name}
          rollNo={callLogStudent.roll_no}
          classroom={callLogStudent.classroom_name}
          absentDate={today}
          existingLog={callLogStudent.latestCallLog}
          onSaved={() => {
            setCallLogStudent(null);
            // Re-trigger details fetch
            onOpenChange(true);
          }}
        />
      )}
    </>
  );
};

export default ZeroYTDModal;

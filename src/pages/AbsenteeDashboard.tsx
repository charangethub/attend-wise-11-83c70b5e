import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, MessageCircle, CalendarDays, Search, Phone, RefreshCw, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageDataset } from "@/hooks/usePageDataset";
import CallLogDialog from "@/components/CallLogDialog";
import CallHistoryDialog from "@/components/CallHistoryDialog";
import { logActivity } from "@/hooks/useActivityLog";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents } from "@/lib/attendanceData";
import { buildAbsenteeRemark, syncAbsenteeSheet } from "@/lib/absenteeSync";

const AbsenteeDashboard = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { datasetSlug: activeSlug } = usePageDataset("Absentee Report");
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [callLogStudent, setCallLogStudent] = useState<any>(null);
  const [historyStudent, setHistoryStudent] = useState<any>(null);
  const autoForwardedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;

    setLoading(true);
    autoForwardedRef.current = false;

    try {
      const studentRows = await fetchDatasetStudents<any>(
        activeSlug,
        "id, roll_no, user_id_vedantu, student_name, grade, classroom_name, mobile_number, emergency_contact_1, emergency_contact_2, enrollment_status",
        { onlyEnrolled: true },
      );
      const studentIds = studentRows.map((s: any) => s.id);
      const attendanceRows = await fetchAttendanceForStudents<any>({
        columns: "id, student_id, status, remark, session",
        studentIds,
        exactDate: selectedDate,
        statuses: ["A", "L"],
      });

      const clMap: Record<string, any> = {};
      if (studentIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 100) chunks.push(studentIds.slice(i, i + 100));
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data } = await supabase
              .from("call_logs" as any)
              .select("*")
              .in("student_id", chunk)
              .eq("absent_date", selectedDate);
            (data as any[])?.forEach((row: any) => {
              clMap[row.student_id] = row;
            });
          }),
        );
      }

      setStudents(studentRows);
      setAttendance(attendanceRows);
      setCallLogs(clMap);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, activeSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug),
    channelKey: `absentees:${activeSlug}:${selectedDate}`,
    onRefresh: fetchData,
    exactDate: selectedDate,
    debounceMs: 500,
  });

  // Auto-forward call logs
  useEffect(() => {
    if (loading || autoForwardedRef.current || !user) return;

    const absentStudentIds = new Set(attendance.map((a: any) => a.student_id));
    const studentsWithoutLog = [...absentStudentIds].filter((id) => !callLogs[id]);

    if (studentsWithoutLog.length === 0) {
      autoForwardedRef.current = true;
      return;
    }

    const autoForward = async () => {
      autoForwardedRef.current = true;
      const chunks: string[][] = [];
      for (let i = 0; i < studentsWithoutLog.length; i += 100) chunks.push(studentsWithoutLog.slice(i, i + 100));

      const toUpsert: any[] = [];

      await Promise.all(
        chunks.map(async (chunk) => {
          const { data } = await supabase
            .from("call_logs" as any)
            .select("student_id, call_status, absence_reason, comment, expected_return_date, absent_date")
            .in("student_id", chunk)
            .gt("expected_return_date", selectedDate)
            .lt("absent_date", selectedDate)
            .order("absent_date", { ascending: false })
            .limit(chunk.length * 3);

          const seen = new Set<string>();
          (data as any[])?.forEach((row: any) => {
            if (seen.has(row.student_id)) return;
            seen.add(row.student_id);
            toUpsert.push({
              student_id: row.student_id,
              absent_date: selectedDate,
              call_status: row.call_status,
              absence_reason: row.absence_reason,
              comment: `[Auto-forwarded from ${row.absent_date}] ${row.comment || ""}`.trim(),
              expected_return_date: row.expected_return_date,
              created_by: user.id,
            });
          });
        }),
      );

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("call_logs" as any)
          .upsert(toUpsert as any[], { onConflict: "student_id,absent_date" });

        if (!error) {
          await Promise.all(
            toUpsert.map((row) =>
              supabase
                .from("attendance")
                .update({ remark: buildAbsenteeRemark(row.absence_reason, row.comment) })
                .eq("student_id", row.student_id)
                .eq("date", selectedDate)
                .in("status", ["A", "AB", "L"]),
            ),
          );

          await syncAbsenteeSheet(selectedDate);

          const newMap = { ...callLogs };
          toUpsert.forEach((row) => { newMap[row.student_id] = { ...row, _autoForwarded: true }; });
          setCallLogs(newMap);
        }
      }
    };

    void autoForward();
  }, [loading, attendance, callLogs, selectedDate, user]);

  const absentees = useMemo(() => {
    const studentAttMap = new Map<string, any>();
    attendance.forEach((a: any) => {
      if (!studentAttMap.has(a.student_id)) studentAttMap.set(a.student_id, a);
    });

    return students
      .filter((s) => studentAttMap.has(s.id))
      .filter((s) => classroomFilter === "all" || s.classroom_name === classroomFilter)
      .filter((s) => {
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return s.student_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q);
      })
      .map((s) => {
        const att = studentAttMap.get(s.id)!;
        const cl = callLogs[s.id];
        return {
          ...s,
          status: att.status,
          remark: att.remark || "",
          callLog: cl || null,
          isAutoForwarded: cl?._autoForwarded || cl?.comment?.startsWith("[Auto-forwarded"),
        };
      })
      .filter((s) => {
        if (statusFilter === "absent") return s.status === "A";
        if (statusFilter === "absent_no_remark") return !s.callLog;
        return true;
      })
      .sort((a, b) => a.roll_no.localeCompare(b.roll_no));
  }, [students, attendance, classroomFilter, debouncedSearch, statusFilter, callLogs]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s: any) => s.classroom_name).filter(Boolean))).sort(), [students]);

  const maskNumber = (num: string) => { if (!num || num.length < 4) return "••••••••"; return "••••••" + num.slice(-4); };
  const makeWhatsAppUrl = (contactNum: string, studentName: string, rollNo: string, status: string) => {
    const cleanNum = contactNum.replace(/\D/g, "");
    if (!cleanNum) return null;
    const msg = encodeURIComponent(`Dear Parent, your child ${studentName} (Roll: ${rollNo}) was marked ${status === "A" ? "Absent" : status} on ${selectedDate}. - Vedantu Learning Centre`);
    return `https://wa.me/91${cleanNum}?text=${msg}`;
  };

  const exportCSV = () => {
    const headers = isAdminOrOwner
      ? ["Roll No", "Student Name", "Grade", "Classroom", "Emergency Contact 1", "Emergency Contact 2", "Status", "Call Status", "Absence Reason", "Comment"]
      : ["Roll No", "Student Name", "Grade", "Classroom", "Status", "Call Status", "Absence Reason", "Comment"];
    const rows = absentees.map((s) => {
      const base = [s.roll_no, s.student_name, s.grade, s.classroom_name];
      if (isAdminOrOwner) base.push(s.emergency_contact_1 || "", s.emergency_contact_2 || "");
      base.push(s.status === "A" ? "Absent" : s.status);
      base.push(s.callLog?.call_status || "—", s.callLog?.absence_reason || "—", s.callLog?.comment || "");
      return base;
    });
    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `absentees-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const getCallStatusDisplay = (cl: any) => {
    if (!cl) return <span className="text-xs text-muted-foreground">Pending</span>;
    const colors: Record<string, string> = {
      "Called": "bg-success/20 text-success",
      "Not Reachable": "bg-warning/20 text-warning",
      "Callback Scheduled": "bg-primary/20 text-primary",
    };
    return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${colors[cl.call_status] || "bg-muted text-muted-foreground"}`}>{cl.call_status}</span>;
  };

  const getRemarkDisplay = (s: any) => {
    const cl = s.callLog;
    if (!cl) return <span className="text-xs text-muted-foreground">—</span>;

    const comment = cl.comment?.replace(/^\[Auto-forwarded.*?\]\s*/, "").trim();
    const reason = cl.absence_reason;

    if (comment) {
      return (
        <div className="max-w-[200px]">
          <p className="text-xs text-foreground truncate">{comment}</p>
          {reason && <p className="text-[10px] text-muted-foreground truncate">{reason}</p>}
        </div>
      );
    }
    if (reason) return <span className="text-xs text-foreground">{reason}</span>;
    return <span className="text-xs text-muted-foreground">—</span>;
  };

  return (
    <div className="w-full px-4 py-6 max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div><h2 className="text-2xl font-bold text-foreground">Daily Absentee Report</h2><p className="text-sm text-muted-foreground">{absentees.length} absent students</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger><SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="absent_no_remark">Absent - No Log</SelectItem></SelectContent></Select>
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : absentees.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No absentees for this date 🎉</p>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm"><thead><tr className="bg-muted/50">
            <th className="px-4 py-2.5 text-left font-semibold">Roll No</th>
            <th className="px-4 py-2.5 text-left font-semibold">Student Name</th>
            <th className="px-4 py-2.5 text-left font-semibold">Classroom</th>
            <th className="px-4 py-2.5 text-center font-semibold">Status</th>
            <th className="px-4 py-2.5 text-center font-semibold">Call Status</th>
            <th className="px-4 py-2.5 text-left font-semibold">Remarks / RCA</th>
            <th className="px-4 py-2.5 text-center font-semibold">Action</th>
            <th className="px-4 py-2.5 text-center font-semibold">History</th>
            <th className="px-4 py-2.5 text-center font-semibold">WhatsApp</th>
          </tr></thead>
            <tbody>{absentees.map((s, i) => {
              const ec1 = s.emergency_contact_1 || ""; const ec2 = s.emergency_contact_2 || "";
              const wa1 = ec1 ? makeWhatsAppUrl(ec1, s.student_name, s.roll_no, s.status) : null;
              const wa2 = ec2 ? makeWhatsAppUrl(ec2, s.student_name, s.roll_no, s.status) : null;
              return (
                <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-4 py-2.5 font-medium">{s.roll_no}</td>
                  <td className="px-4 py-2.5 font-medium">{s.student_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.classroom_name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${s.status === "A" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
                      {s.status === "A" ? "Absent" : "Leave"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {getCallStatusDisplay(s.callLog)}
                      {s.isAutoForwarded && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold text-warning" title="Auto-forwarded from a previous call log">
                          <RefreshCw className="h-2.5 w-2.5" /> Auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{getRemarkDisplay(s)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Button variant="outline" size="sm" onClick={() => setCallLogStudent(s)} className="text-xs">
                      <Phone className="h-3 w-3 mr-1" /> Update
                    </Button>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setHistoryStudent(s)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {wa1 && <a href={wa1} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-success" /></Button></a>}
                      {wa2 && <a href={wa2} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-primary" /></Button></a>}
                      {!wa1 && !wa2 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {callLogStudent && (
        <CallLogDialog
          open={!!callLogStudent}
          onOpenChange={(open) => { if (!open) setCallLogStudent(null); }}
          studentId={callLogStudent.id}
          studentName={callLogStudent.student_name}
          rollNo={callLogStudent.roll_no}
          classroom={callLogStudent.classroom_name}
          absentDate={selectedDate}
          mobileNumber={callLogStudent.mobile_number}
          emergencyContact1={callLogStudent.emergency_contact_1}
          emergencyContact2={callLogStudent.emergency_contact_2}
          existingLog={callLogStudent.callLog}
          onSaved={() => { setCallLogStudent(null); void fetchData(); }}
        />
      )}
      {historyStudent && (
        <CallHistoryDialog
          open={!!historyStudent}
          onOpenChange={(o) => { if (!o) setHistoryStudent(null); }}
          studentId={historyStudent.id}
          studentName={historyStudent.student_name}
        />
      )}
    </div>
  );
};
export default AbsenteeDashboard;

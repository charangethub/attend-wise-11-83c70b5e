import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, MessageCircle, CalendarDays, Search, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { getCombinedStatus, getCombinedStatusBadge } from "@/lib/attendanceSession";
import RemarkDialog from "@/components/RemarkDialog";
import { logActivity } from "@/hooks/useActivityLog";

const AbsenteeDashboard = () => {
  const { user, userRole } = useAuth();
  const { userRole } = useAuth();
  const { activeSlug } = useActiveDataset();
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [remarkDialogStudent, setRemarkDialogStudent] = useState<any>(null);

  // ✅ FIX (Bug 3): Extracted fetchData into useCallback so it can be called
  // both from useEffect and from the visibilitychange listener.
  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    const [stuRes, attRes] = await Promise.all([
      supabase.from("students").select("id, roll_no, student_name, grade, classroom_name, emergency_contact_1, emergency_contact_2, enrollment_status").neq("roll_no", "").eq("enrollment_status", "ENROLLED").eq("dataset", activeSlug),
      supabase.from("attendance").select("id, student_id, status, remark, session").eq("date", selectedDate).in("status", ["AB", "L"])
    ]);
    setStudents(stuRes.data ?? []);
    setAttendance(attRes.data ?? []);
    setLoading(false);
  }, [selectedDate, activeSlug]);

  // Initial load + reload when date/dataset changes
  useEffect(() => { void fetchData(); }, [fetchData]);

  // ✅ FIX (Bug 3): Page Visibility API — refetch when user returns to this tab.
  // If another teacher marked attendance while you were on a different page/tab,
  // you'll see the updated absentee list as soon as you come back.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchData]);

  // Build per-student combined status from AM/PM records
  const absentees = useMemo(() => {
    const studentAttMap = new Map<string, { AM?: any; PM?: any }>();
    attendance.forEach((a: any) => {
      if (!studentAttMap.has(a.student_id)) studentAttMap.set(a.student_id, {});
      const entry = studentAttMap.get(a.student_id)!;
      const session = a.session || "AM";
      if (session === "AM") entry.AM = a;
      else entry.PM = a;
    });

    return students
      .filter((s) => studentAttMap.has(s.id))
      .filter((s) => classroomFilter === "all" || s.classroom_name === classroomFilter)
      .filter((s) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.student_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q);
      })
      .map((s) => {
        const sessions = studentAttMap.get(s.id)!;
        const amStatus = sessions.AM?.status;
        const pmStatus = sessions.PM?.status;
        const combined = getCombinedStatus(amStatus, pmStatus);
        const remarkAM = sessions.AM?.remark || "";
        const remarkPM = sessions.PM?.remark || "";
        const combinedRemark = [remarkAM, remarkPM].filter(Boolean).join(" | ");
        return { ...s, combined, amStatus, pmStatus, remarkAM, remarkPM, combinedRemark, sessions };
      })
      .filter((s) => {
        if (statusFilter === "absent") return s.combined === "AB" || s.combined.includes("A");
        if (statusFilter === "absent_no_remark") return !s.combinedRemark;
        return true;
      })
      .sort((a, b) => a.roll_no.localeCompare(b.roll_no));
  }, [students, attendance, classroomFilter, searchQuery, statusFilter]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s: any) => s.classroom_name).filter(Boolean))).sort(), [students]);

  const handleSaveRemark = async (studentId: string, remark: string) => {
    try {
      await supabase.from("attendance").update({ remark }).eq("student_id", studentId).eq("date", selectedDate);
      toast.success("Remark saved!");
      setAttendance(prev => prev.map(a => a.student_id === studentId ? { ...a, remark } : a));
      try { await supabase.functions.invoke("sync-to-sheet", { body: { date: selectedDate } }); } catch {}
    } catch { toast.error("Failed to save remark"); }
  };

  const maskNumber = (num: string) => { if (!num || num.length < 4) return "••••••••"; return "••••••" + num.slice(-4); };
  const makeWhatsAppUrl = (contactNum: string, studentName: string, rollNo: string, status: string) => {
    const cleanNum = contactNum.replace(/\D/g, "");
    if (!cleanNum) return null;
    const msg = encodeURIComponent(`Dear Parent, your child ${studentName} (Roll: ${rollNo}) was marked ${status} on ${selectedDate}. - Vedantu Learning Centre`);
    return `https://wa.me/91${cleanNum}?text=${msg}`;
  };

  const exportCSV = () => {
    const headers = isAdminOrOwner
      ? ["Roll No", "Student Name", "Grade", "Classroom", "Emergency Contact 1", "Emergency Contact 2", "AM", "PM", "Combined", "Remark"]
      : ["Roll No", "Student Name", "Grade", "Classroom", "AM", "PM", "Combined", "Remark"];
    const rows = absentees.map((s) => {
      const base = [s.roll_no, s.student_name, s.grade, s.classroom_name];
      if (isAdminOrOwner) base.push(s.emergency_contact_1 || "", s.emergency_contact_2 || "");
      base.push(s.amStatus || "—", s.pmStatus || "—", s.combined, s.combinedRemark || "");
      return base;
    });
    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `absentees-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div><h2 className="text-2xl font-bold text-foreground">Daily Absentee Report</h2><p className="text-sm text-muted-foreground">{absentees.length} absent/on leave</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger><SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="absent_no_remark">Absent - No Remark</SelectItem></SelectContent></Select>
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
            <th className="px-4 py-2.5 text-left font-semibold">Grade</th>
            <th className="px-4 py-2.5 text-left font-semibold">Classroom</th>
            <th className="px-4 py-2.5 text-left font-semibold">Emergency Contact 1</th>
            <th className="px-4 py-2.5 text-left font-semibold">Emergency Contact 2</th>
            <th className="px-4 py-2.5 text-center font-semibold">AM</th>
            <th className="px-4 py-2.5 text-center font-semibold">PM</th>
            <th className="px-4 py-2.5 text-center font-semibold">Status</th>
            <th className="px-4 py-2.5 text-left font-semibold">Remark</th>
            <th className="px-4 py-2.5 text-center font-semibold">WhatsApp</th>
          </tr></thead>
            <tbody>{absentees.map((s, i) => {
              const ec1 = s.emergency_contact_1 || ""; const ec2 = s.emergency_contact_2 || "";
              const wa1 = ec1 ? makeWhatsAppUrl(ec1, s.student_name, s.roll_no, s.combined) : null;
              const wa2 = ec2 ? makeWhatsAppUrl(ec2, s.student_name, s.roll_no, s.combined) : null;
              const sessionBadge = (status?: string) => {
                if (!status) return <span className="text-xs text-muted-foreground">—</span>;
                const colors: Record<string, string> = { AB: "bg-destructive text-destructive-foreground", L: "bg-warning text-warning-foreground", P: "bg-success text-success-foreground" };
                return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${colors[status] || "bg-muted text-muted-foreground"}`}>{status === "AB" ? "Absent" : status === "L" ? "Leave" : status === "P" ? "Present" : status}</span>;
              };
              return (
                <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-4 py-2.5 font-medium">{s.roll_no}</td>
                  <td className="px-4 py-2.5 font-medium">{s.student_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.grade}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.classroom_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ec1 ? (isAdminOrOwner ? ec1 : maskNumber(ec1)) : "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ec2 ? (isAdminOrOwner ? ec2 : maskNumber(ec2)) : "—"}</td>
                  <td className="px-4 py-2.5 text-center">{sessionBadge(s.amStatus)}</td>
                  <td className="px-4 py-2.5 text-center">{sessionBadge(s.pmStatus)}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${getCombinedStatusBadge(s.combined)}`}>{s.combined}</span></td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setRemarkDialogStudent(s)}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs transition-colors hover:bg-muted min-w-[150px]"
                    >
                      <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{s.combinedRemark || "Add remark..."}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {wa1 && <a href={wa1} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-success" /></Button></a>}
                      {wa2 && <a href={wa2} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-primary" /></Button></a>}
                      {!wa1 && !wa2 && <span className="text-xs text-muted-foreground">No number</span>}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {remarkDialogStudent && (
        <RemarkDialog
          open={!!remarkDialogStudent}
          onOpenChange={(open) => { if (!open) setRemarkDialogStudent(null); }}
          studentName={remarkDialogStudent.student_name}
          rollNo={remarkDialogStudent.roll_no}
          grade={remarkDialogStudent.grade}
          classroom={remarkDialogStudent.classroom_name}
          date={selectedDate}
          currentRemark={remarkDialogStudent.combinedRemark || ""}
          onSave={(remark) => {
            handleSaveRemark(remarkDialogStudent.id, remark);
            setRemarkDialogStudent(null);
          }}
        />
      )}
    </div>
  );
};
export default AbsenteeDashboard;

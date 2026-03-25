import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, RefreshCw, Search, CheckCircle, XCircle, Clock, Trash2, LayoutGrid, List, ArrowLeft, CalendarDays, Sun, Moon, MessageSquare, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { logActivity } from "@/hooks/useActivityLog";
import RemarkDialog from "@/components/RemarkDialog";

type Student = { id: string; roll_no: string; student_name: string; grade: string; curriculum: string; classroom_name: string; enrollment_status: string; };
type AttendanceDraft = { attendance: Record<string, string>; remarks: Record<string, string> };

const readSessionJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const AttendanceDashboard = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { activeSlug, activeName } = useActiveDataset();
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem("att-date") || today);
  const [selectedSession, setSelectedSession] = useState<"AM" | "PM">(() => (sessionStorage.getItem("att-session") as "AM" | "PM") || "AM");
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [originalAttendance, setOriginalAttendance] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [originalRemarks, setOriginalRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [classroomFilter, setClassroomFilter] = useState(() => sessionStorage.getItem("att-classroom") || "all");
  const [enrollmentFilter, setEnrollmentFilter] = useState(() => sessionStorage.getItem("att-enrollment") || "ENROLLED");
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem("att-search") || "");
  const [showUnmarkedOnly, setShowUnmarkedOnly] = useState(() => sessionStorage.getItem("att-unmarked") === "true");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "table">(() => (localStorage.getItem("att-view") as any) || "table");
  const [remarkDialogStudent, setRemarkDialogStudent] = useState<Student | null>(null);
  const [copyingAM, setCopyingAM] = useState(false);
  const loadedDraftKeyRef = useRef<string | null>(null);
  const canEdit = selectedDate === today || userRole === "owner";
  const canCopyAM = selectedSession === "PM" && (userRole === "owner" || userRole === "admin");
  const draftStorageKey = useMemo(
    () => activeSlug ? `att-draft:${activeSlug}:${selectedDate}:${selectedSession}` : null,
    [activeSlug, selectedDate, selectedSession]
  );

  const handleCopyAMtoPM = async () => {
    setCopyingAM(true);
    try {
      const { data: amData } = await supabase
        .from("attendance")
        .select("student_id, status, remark")
        .eq("date", selectedDate)
        .eq("session", "AM");
      if (!amData || amData.length === 0) {
        toast.info("No AM attendance found to copy");
        setCopyingAM(false);
        return;
      }
      const updated = { ...attendance };
      const updatedRemarks = { ...remarks };
      let copied = 0;
      for (const am of amData) {
        if (!updated[am.student_id]) {
          updated[am.student_id] = am.status;
          if (am.remark) updatedRemarks[am.student_id] = am.remark;
          copied++;
        }
      }
      setAttendance(updated);
      setRemarks(updatedRemarks);
      toast.success(`Copied ${copied} unmarked students from AM to PM`);
    } catch (err: any) {
      toast.error("Failed to copy AM attendance");
    }
    setCopyingAM(false);
  };

  useEffect(() => { localStorage.setItem("att-view", viewMode); }, [viewMode]);
  useEffect(() => { sessionStorage.setItem("att-date", selectedDate); }, [selectedDate]);
  useEffect(() => { sessionStorage.setItem("att-session", selectedSession); }, [selectedSession]);
  useEffect(() => { sessionStorage.setItem("att-classroom", classroomFilter); }, [classroomFilter]);
  useEffect(() => { sessionStorage.setItem("att-enrollment", enrollmentFilter); }, [enrollmentFilter]);
  useEffect(() => { sessionStorage.setItem("att-search", searchQuery); }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem("att-unmarked", String(showUnmarkedOnly)); }, [showUnmarkedOnly]);
  useEffect(() => { loadedDraftKeyRef.current = null; }, [draftStorageKey]);

  useEffect(() => {
    const fetchData = async () => {
      if (!activeSlug || !draftStorageKey) return;
      setLoading(true);
      const [stuRes, attRes] = await Promise.all([
        supabase.from("students").select("id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status").neq("roll_no", "").eq("dataset", activeSlug),
        supabase.from("attendance").select("student_id, status, remark, session").eq("date", selectedDate).eq("session", selectedSession),
      ]);
      const serverAttendance: Record<string, string> = {};
      const serverRemarks: Record<string, string> = {};
      (attRes.data ?? []).forEach((a: any) => { serverAttendance[a.student_id] = a.status; serverRemarks[a.student_id] = a.remark || ""; });
      const draft = readSessionJson<AttendanceDraft | null>(draftStorageKey, null);

      setStudents(stuRes.data ?? []);
      setAttendance(draft?.attendance ?? serverAttendance);
      setOriginalAttendance(serverAttendance);
      setRemarks(draft?.remarks ?? serverRemarks);
      setOriginalRemarks(serverRemarks);
      loadedDraftKeyRef.current = draftStorageKey;
      setLoading(false);
    };
    fetchData();
  }, [selectedDate, activeSlug, selectedSession, draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || loading || loadedDraftKeyRef.current !== draftStorageKey) return;
    const hasDraftChanges = JSON.stringify(attendance) !== JSON.stringify(originalAttendance)
      || JSON.stringify(remarks) !== JSON.stringify(originalRemarks);

    if (!hasDraftChanges) {
      sessionStorage.removeItem(draftStorageKey);
      return;
    }

    sessionStorage.setItem(draftStorageKey, JSON.stringify({ attendance, remarks } satisfies AttendanceDraft));
  }, [draftStorageKey, loading, attendance, remarks, originalAttendance, originalRemarks]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s) => s.classroom_name).filter(Boolean))).sort(), [students]);
  const filteredStudents = useMemo(() => students.filter((s) => {
    if (enrollmentFilter !== "all" && s.enrollment_status !== enrollmentFilter) return false;
    if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
    if (searchQuery) { const q = searchQuery.toLowerCase(); if (!s.student_name.toLowerCase().includes(q) && !s.roll_no.toLowerCase().includes(q)) return false; }
    if (showUnmarkedOnly && attendance[s.id]) return false;
    if (statusFilter === "P" && attendance[s.id] !== "P") return false;
    if (statusFilter === "AB" && attendance[s.id] !== "AB") return false;
    if (statusFilter === "L" && attendance[s.id] !== "L") return false;
    if (statusFilter === "H" && attendance[s.id] !== "H") return false;
    return true;
  }).sort((a, b) => a.roll_no.localeCompare(b.roll_no)), [students, enrollmentFilter, classroomFilter, searchQuery, showUnmarkedOnly, attendance, statusFilter]);

  const hasUnsavedChanges = JSON.stringify(attendance) !== JSON.stringify(originalAttendance) || JSON.stringify(remarks) !== JSON.stringify(originalRemarks);
  const markedCount = filteredStudents.filter((s) => attendance[s.id]).length;
  const pct = filteredStudents.length > 0 ? Math.round((markedCount / filteredStudents.length) * 100) : 0;
  const pCount = filteredStudents.filter((s) => attendance[s.id] === "P").length;
  const abCount = filteredStudents.filter((s) => attendance[s.id] === "AB").length;
  const lCount = filteredStudents.filter((s) => attendance[s.id] === "L").length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const toUpsert = Object.entries(attendance).filter(([, status]) => status).map(([student_id, status]) => ({
        student_id, date: selectedDate, status, marked_by: user.id, session: selectedSession,
        remark: remarks[student_id] || "",
      }));
      const toDelete = Object.keys(originalAttendance).filter((sid) => !attendance[sid]);
      if (toUpsert.length > 0) {
        const { error } = await supabase.from("attendance").upsert(toUpsert, { onConflict: "student_id,date,session" });
        if (error) throw error;
      }
      if (toDelete.length > 0) {
        for (const sid of toDelete) { await supabase.from("attendance").delete().eq("student_id", sid).eq("date", selectedDate).eq("session", selectedSession); }
      }
      // Log activity for each changed student
      const changedStudents = Object.keys(attendance).filter((sid) => attendance[sid] !== originalAttendance[sid] || remarks[sid] !== originalRemarks[sid]);
      if (changedStudents.length > 0) {
        const studentMap = new Map(students.map((s) => [s.id, s.student_name]));
        for (const sid of changedStudents.slice(0, 50)) {
          await logActivity({
            userId: user.id,
            userEmail: user.email ?? "",
            userName: user.user_metadata?.full_name ?? user.email ?? "",
            action: `${selectedSession} attendance marked`,
            studentName: studentMap.get(sid) ?? "",
            studentId: sid,
            details: { date: selectedDate, session: selectedSession, status: attendance[sid], remark: remarks[sid] || "" },
          });
        }
        if (changedStudents.length > 50) {
          await logActivity({
            userId: user.id, userEmail: user.email ?? "", userName: user.user_metadata?.full_name ?? user.email ?? "",
            action: `Bulk ${selectedSession} attendance saved`,
            details: { date: selectedDate, session: selectedSession, total_students: changedStudents.length },
          });
        }
      }
      setOriginalAttendance({ ...attendance });
      setOriginalRemarks({ ...remarks });
      if (draftStorageKey) {
        sessionStorage.removeItem(draftStorageKey);
        loadedDraftKeyRef.current = null;
      }
      toast.success(`${selectedSession} Attendance saved!`);
      try { await supabase.functions.invoke("sync-to-sheet", { body: { date: selectedDate } }); } catch {}
    } catch (err: any) { toast.error("Save failed: " + (err.message || "Unknown error")); }
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheet", { body: { dataset_slug: activeSlug } });
      if (error) throw error;
      toast.success(`Synced ${data?.synced ?? 0} students`);
      const stuRes = await supabase.from("students").select("id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status").neq("roll_no", "").eq("dataset", activeSlug);
      setStudents(stuRes.data ?? []);
    } catch (err: any) { toast.error("Sync failed: " + (err.message || "Unknown")); }
    setSyncing(false);
  };

  const toggleStatus = (studentId: string, status: string) => {
    if (!canEdit) return;
    setAttendance((prev) => {
      const current = prev[studentId];
      if (current === status) { const { [studentId]: _, ...rest } = prev; return rest; }
      return { ...prev, [studentId]: status };
    });
  };

  const statusBtn = (studentId: string, status: string, label: string, color: string) => (
    <button disabled={!canEdit} onClick={() => toggleStatus(studentId, status)}
      className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendance[studentId] === status ? color : "bg-muted text-muted-foreground hover:bg-muted/80"} ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}>{label}</button>
  );

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div><div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-foreground">Mark Attendance</h2><span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{activeName}</span></div><p className="text-sm text-muted-foreground">{filteredStudents.length} students</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={() => { setAttendance({}); setRemarks({}); }} className="gap-1.5"><Trash2 className="h-4 w-4" /> Clear All</Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5"><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync Sheet</Button>
        </div>
      </div>

      {/* Session Toggle */}
      <div className="mb-4 flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          <button onClick={() => setSelectedSession("AM")} className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all ${selectedSession === "AM" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Sun className="h-4 w-4" /> Morning (AM)
          </button>
          <button onClick={() => setSelectedSession("PM")} className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all ${selectedSession === "PM" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Moon className="h-4 w-4" /> Afternoon (PM)
          </button>
        </div>
        <span className="text-xs text-muted-foreground">Marking: <strong>{selectedSession}</strong> session</span>
        {canCopyAM && (
          <Button variant="outline" size="sm" onClick={handleCopyAMtoPM} disabled={copyingAM} className="gap-1.5 ml-2">
            <Copy className={`h-4 w-4 ${copyingAM ? "animate-spin" : ""}`} /> Copy AM → PM
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center">
          <p className="text-2xl font-bold text-success">{pCount}</p>
          <p className="text-xs text-muted-foreground">Present</p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
          <p className="text-2xl font-bold text-destructive">{abCount}</p>
          <p className="text-xs text-muted-foreground">Absent</p>
        </div>
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-center">
          <p className="text-2xl font-bold text-warning">{lCount}</p>
          <p className="text-xs text-muted-foreground">On Leave</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{filteredStudents.length - markedCount}</p>
          <p className="text-xs text-muted-foreground">Unmarked</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Marked: {markedCount} / {filteredStudents.length}</span><div className="flex gap-3 text-xs"><span className="text-success font-bold">P:{pCount}</span><span className="text-destructive font-bold">AB:{abCount}</span><span className="text-warning font-bold">L:{lCount}</span></div></div>
        <Progress value={pct} className="h-2.5" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger><SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}><SelectTrigger className="w-44"><SelectValue placeholder="All Enrollment" /></SelectTrigger><SelectContent><SelectItem value="all">All Enrollment</SelectItem><SelectItem value="ENROLLED">ENROLLED</SelectItem><SelectItem value="FORFEITED">FORFEITED</SelectItem></SelectContent></Select>
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name or roll no..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Button variant={showUnmarkedOnly ? "default" : "outline"} size="sm" onClick={() => setShowUnmarkedOnly(!showUnmarkedOnly)}>Show Unmarked Only</Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-32 h-9"><SelectValue placeholder="All Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="P">Present</SelectItem><SelectItem value="AB">Absent</SelectItem><SelectItem value="L">On Leave</SelectItem><SelectItem value="H">Holiday</SelectItem></SelectContent></Select>
          <span className="text-muted-foreground ml-2">Mark all:</span>
          <Button variant="outline" size="sm" className="gap-1 text-success border-success/30 hover:bg-success/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "P"; }); setAttendance(u); }}><CheckCircle className="h-3.5 w-3.5" /> All Present</Button>
          <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "AB"; }); setAttendance(u); }}><XCircle className="h-3.5 w-3.5" /> All Absent</Button>
          <Button variant="outline" size="sm" className="gap-1 border-purple-300 hover:bg-purple-50 text-purple-600" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "H"; }); setAttendance(u); }}>🏖 All Holiday</Button>
          <Button variant="outline" size="sm" className="gap-1 text-muted-foreground border-muted-foreground/30 hover:bg-muted" onClick={() => {
            const u = { ...attendance };
            const r = { ...remarks };
            filteredStudents.forEach((s) => { delete u[s.id]; delete r[s.id]; });
            setAttendance(u);
            setRemarks(r);
            toast.info(`Unmarked ${filteredStudents.length} students`);
          }}><Trash2 className="h-3.5 w-3.5" /> Unmark</Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={viewMode === "card" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setViewMode("card")}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {!canEdit && selectedDate !== today && <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">⚠️ You can only edit today's attendance. Past dates are view-only for non-owners.</div>}

      {viewMode === "card" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredStudents.map((s) => (
            <div key={s.id} className={`rounded-xl border p-3 transition-all ${attendance[s.id] === "P" ? "border-success/50 bg-success/5" : attendance[s.id] === "AB" ? "border-destructive/50 bg-destructive/5" : attendance[s.id] === "L" ? "border-warning/50 bg-warning/5" : attendance[s.id] === "H" ? "border-purple-400/50 bg-purple-50" : "border-border bg-card"}`}>
              <div className="mb-2"><span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{s.roll_no}</span><p className="mt-1 text-sm font-semibold text-foreground truncate">{s.student_name}</p><p className="text-[10px] text-muted-foreground truncate">{s.grade} · {s.curriculum} · {s.classroom_name}</p></div>
              <div className="flex gap-1">{statusBtn(s.id, "P", "P", "bg-success text-success-foreground")}{statusBtn(s.id, "AB", "AB", "bg-destructive text-destructive-foreground")}{statusBtn(s.id, "L", "L", "bg-warning text-warning-foreground")}{statusBtn(s.id, "H", "H", "bg-purple-600 text-primary-foreground")}</div>
              {attendance[s.id] === "L" && (
                <button
                  onClick={() => setRemarkDialogStudent(s)}
                  className="mt-2 w-full flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-left transition-colors hover:bg-warning/20"
                >
                  <MessageSquare className="h-3 w-3 text-warning shrink-0" />
                  <span className="truncate">{remarks[s.id] || "Add reason..."}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm"><thead className="sticky top-0 z-10"><tr className="bg-muted/80 backdrop-blur"><th className="px-3 py-2.5 text-left font-semibold text-foreground">Roll No</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Student Name</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Grade</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Curriculum</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Classroom</th><th className="px-3 py-2.5 text-center font-semibold text-foreground">Attendance</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Remark</th></tr></thead>
            <tbody>{filteredStudents.map((s, i) => (<tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
              <td className="px-3 py-2.5 font-medium text-foreground">{s.roll_no}</td>
              <td className="px-3 py-2.5 text-foreground">{s.student_name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{s.grade}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{s.curriculum}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{s.classroom_name}</td>
              <td className="px-3 py-2.5"><div className="flex justify-center gap-1.5">{statusBtn(s.id, "P", "P", "bg-success text-success-foreground")}{statusBtn(s.id, "AB", "AB", "bg-destructive text-destructive-foreground")}{statusBtn(s.id, "L", "L", "bg-warning text-warning-foreground")}{statusBtn(s.id, "H", "H", "bg-purple-600 text-primary-foreground")}</div></td>
              <td className="px-3 py-2.5">
                {attendance[s.id] === "L" ? (
                  <button
                    onClick={() => setRemarkDialogStudent(s)}
                    className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-warning/20 min-w-[150px]"
                  >
                    <MessageSquare className="h-3 w-3 text-warning shrink-0" />
                    <span className="truncate">{remarks[s.id] || "Add reason..."}</span>
                  </button>
                ) : (
                  remarks[s.id] ? (
                    <button
                      onClick={() => setRemarkDialogStudent(s)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MessageSquare className="h-3 w-3 shrink-0" />
                      <span className="truncate">{remarks[s.id]}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )
                )}
              </td>
            </tr>))}</tbody></table>
        </div>
      )}
      {filteredStudents.length === 0 && <p className="py-12 text-center text-muted-foreground">No students found</p>}
      {canEdit && <button onClick={handleSave} disabled={saving} className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-success px-6 py-3 text-sm font-bold text-success-foreground shadow-lg transition-all hover:scale-105 ${hasUnsavedChanges ? "animate-pulse" : ""}`}>{saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save {selectedSession}</button>}
      {remarkDialogStudent && (
        <RemarkDialog
          open={!!remarkDialogStudent}
          onOpenChange={(open) => { if (!open) setRemarkDialogStudent(null); }}
          studentName={remarkDialogStudent.student_name}
          rollNo={remarkDialogStudent.roll_no}
          grade={remarkDialogStudent.grade}
          classroom={remarkDialogStudent.classroom_name}
          date={selectedDate}
          session={selectedSession}
          currentRemark={remarks[remarkDialogStudent.id] || ""}
          onSave={(remark) => setRemarks((prev) => ({ ...prev, [remarkDialogStudent.id]: remark }))}
        />
      )}
    </div>
  );
};

export default AttendanceDashboard;

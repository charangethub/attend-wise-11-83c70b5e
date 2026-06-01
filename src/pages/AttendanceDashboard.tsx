import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, RefreshCw, Search, CheckCircle, XCircle, Trash2, LayoutGrid, List, ArrowLeft, CalendarDays, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageDataset } from "@/hooks/usePageDataset";
import { logActivity, logActivityBatch } from "@/hooks/useActivityLog";
import RemarkDialog from "@/components/RemarkDialog";
import { useAttendanceAutoRefresh } from "@/hooks/useAttendanceAutoRefresh";
import { fetchAttendanceForStudents, fetchDatasetStudents } from "@/lib/attendanceData";
import { queueAttendanceSheetSync } from "@/lib/sheetSync";

type Student = { id: string; roll_no: string; student_name: string; grade: string; curriculum: string; classroom_name: string; enrollment_status: string; };
type AttendanceDraft = { attendance: Record<string, string>; remarks: Record<string, string> };

const SESSION = "AM"; // Fixed single session

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
  const { datasetSlug: activeSlug, datasetName: activeName } = usePageDataset("Mark Attendance");
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem("att-date") || today);
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadedDraftKeyRef = useRef<string | null>(null);
  const draftKeyForCleanupRef = useRef<string | null>(null);
  const originalAttendanceRef = useRef<Record<string, string>>({});
  const originalRemarksRef = useRef<Record<string, string>>({});

  useEffect(() => { originalAttendanceRef.current = originalAttendance; }, [originalAttendance]);
  useEffect(() => { originalRemarksRef.current = originalRemarks; }, [originalRemarks]);

  const canEdit = selectedDate === today || userRole === "owner";
  const draftStorageKey = useMemo(
    () => activeSlug ? `att-draft:${activeSlug}:${selectedDate}:${SESSION}` : null,
    [activeSlug, selectedDate]
  );

  const fetchAttendanceData = useCallback(async (preserveUserChanges = false) => {
    if (!activeSlug || !draftStorageKey) return;
    if (!preserveUserChanges) setLoading(true);

    const studentRows = await fetchDatasetStudents<Student>(activeSlug, "id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status");
    const attendanceRows = await fetchAttendanceForStudents<any>({
      columns: "student_id, status, remark, session",
      studentIds: studentRows.map((student) => student.id),
      exactDate: selectedDate,
      session: SESSION,
    });

    const serverAttendance: Record<string, string> = {};
    const serverRemarks: Record<string, string> = {};
    attendanceRows.forEach((a: any) => {
      serverAttendance[a.student_id] = a.status;
      serverRemarks[a.student_id] = a.remark || "";
    });

    if (!preserveUserChanges) {
      const draft = readSessionJson<AttendanceDraft | null>(draftStorageKey, null);
      setStudents(studentRows);
      setAttendance(draft?.attendance ?? serverAttendance);
      setOriginalAttendance(serverAttendance);
      setRemarks(draft?.remarks ?? serverRemarks);
      setOriginalRemarks(serverRemarks);
      loadedDraftKeyRef.current = draftStorageKey;
      setLoading(false);
    } else {
      setStudents(studentRows);
      setOriginalAttendance(serverAttendance);
      setOriginalRemarks(serverRemarks);

      setAttendance(prev => {
        const orig = originalAttendanceRef.current;
        const merged = { ...serverAttendance };
        Object.keys(prev).forEach(sid => {
          if (prev[sid] !== orig[sid]) merged[sid] = prev[sid];
        });
        return merged;
      });
      setRemarks(prev => {
        const orig = originalRemarksRef.current;
        const merged = { ...serverRemarks };
        Object.keys(prev).forEach(sid => {
          if (prev[sid] !== orig[sid]) merged[sid] = prev[sid];
        });
        return merged;
      });
    }
  }, [activeSlug, draftStorageKey, selectedDate]);

  useEffect(() => {
    loadedDraftKeyRef.current = null;
    void fetchAttendanceData(false);
  }, [selectedDate, activeSlug, draftStorageKey]);

  useAttendanceAutoRefresh({
    enabled: Boolean(activeSlug && selectedDate),
    channelKey: `attendance-live:${activeSlug}:${selectedDate}:${SESSION}`,
    onRefresh: () => fetchAttendanceData(true),
    exactDate: selectedDate,
    session: SESSION,
    debounceMs: 500,
  });

  useEffect(() => { localStorage.setItem("att-view", viewMode); }, [viewMode]);
  useEffect(() => { sessionStorage.setItem("att-date", selectedDate); }, [selectedDate]);
  useEffect(() => { sessionStorage.setItem("att-classroom", classroomFilter); }, [classroomFilter]);
  useEffect(() => { sessionStorage.setItem("att-enrollment", enrollmentFilter); }, [enrollmentFilter]);
  useEffect(() => { sessionStorage.setItem("att-search", searchQuery); }, [searchQuery]);
  useEffect(() => { sessionStorage.setItem("att-unmarked", String(showUnmarkedOnly)); }, [showUnmarkedOnly]);
  useEffect(() => { loadedDraftKeyRef.current = null; }, [draftStorageKey]);
  useEffect(() => { draftKeyForCleanupRef.current = draftStorageKey; }, [draftStorageKey]);

  useEffect(() => {
    return () => {
      if (draftKeyForCleanupRef.current) sessionStorage.removeItem(draftKeyForCleanupRef.current);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("att-draft:")) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!draftStorageKey || loading || loadedDraftKeyRef.current !== draftStorageKey) return;

    // Debounced + shallow diff: avoids per-keystroke JSON.stringify of large maps.
    const handle = setTimeout(() => {
      const shallowEqual = (a: Record<string, string>, b: Record<string, string>) => {
        const ak = Object.keys(a);
        const bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        for (const k of ak) if (a[k] !== b[k]) return false;
        return true;
      };
      const hasDraftChanges =
        !shallowEqual(attendance, originalAttendance) ||
        !shallowEqual(remarks, originalRemarks);

      if (!hasDraftChanges) {
        sessionStorage.removeItem(draftStorageKey);
        return;
      }
      sessionStorage.setItem(draftStorageKey, JSON.stringify({ attendance, remarks } satisfies AttendanceDraft));
    }, 400);

    return () => clearTimeout(handle);
  }, [draftStorageKey, loading, attendance, remarks, originalAttendance, originalRemarks]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s) => s.classroom_name).filter(Boolean))).sort(), [students]);

  const filteredStudents = useMemo(() => students.filter((s) => {
    if (enrollmentFilter !== "all" && s.enrollment_status !== enrollmentFilter) return false;
    if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
    if (searchQuery) { const q = searchQuery.toLowerCase(); if (!s.student_name.toLowerCase().includes(q) && !(s.roll_no || "").toLowerCase().includes(q)) return false; }
    if (showUnmarkedOnly && attendance[s.id]) return false;
    if (statusFilter === "P" && attendance[s.id] !== "P") return false;
    if (statusFilter === "A" && attendance[s.id] !== "A") return false;
    if (statusFilter === "H" && attendance[s.id] !== "H") return false;
    return true;
  }).sort((a, b) => {
    const c = (a.classroom_name || "").localeCompare(b.classroom_name || "");
    if (c !== 0) return c;
    return (a.roll_no || "").localeCompare(b.roll_no || "");
  }), [students, enrollmentFilter, classroomFilter, searchQuery, showUnmarkedOnly, attendance, statusFilter]);

  // Group filtered students by classroom for display
  const groupedByClassroom = useMemo(() => {
    const groups: { classroom: string; students: Student[] }[] = [];
    let cur: { classroom: string; students: Student[] } | null = null;
    for (const s of filteredStudents) {
      const key = s.classroom_name || "Unassigned";
      if (!cur || cur.classroom !== key) {
        cur = { classroom: key, students: [] };
        groups.push(cur);
      }
      cur.students.push(s);
    }
    return groups;
  }, [filteredStudents]);

  const hasUnsavedChanges = JSON.stringify(attendance) !== JSON.stringify(originalAttendance) || JSON.stringify(remarks) !== JSON.stringify(originalRemarks);
  const markedCount = filteredStudents.filter((s) => attendance[s.id]).length;
  const pct = filteredStudents.length > 0 ? Math.round((markedCount / filteredStudents.length) * 100) : 0;
  const pCount = filteredStudents.filter((s) => attendance[s.id] === "P").length;
  const abCount = filteredStudents.filter((s) => attendance[s.id] === "A").length;
  const hCount = filteredStudents.filter((s) => attendance[s.id] === "H").length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const attendanceSnapshot = { ...attendance };
    const remarksSnapshot = { ...remarks };
    const changedStudents = Object.keys(attendanceSnapshot).filter(
      (sid) =>
        attendanceSnapshot[sid] !== originalAttendance[sid] ||
        remarksSnapshot[sid] !== originalRemarks[sid]
    );

    try {
      const toUpsert = Object.entries(attendanceSnapshot)
        .filter(([, status]) => status)
        .map(([student_id, status]) => ({
          student_id,
          date: selectedDate,
          status,
          marked_by: user.id,
          session: SESSION,
          remark: remarksSnapshot[student_id] || "",
        }));

      const toDelete = Object.keys(originalAttendance).filter((sid) => !attendanceSnapshot[sid]);

      if (toUpsert.length > 0) {
        const { error } = await supabase.from("attendance").upsert(toUpsert, { onConflict: "student_id,date,session" });
        if (error) throw error;
      }

      if (toDelete.length > 0) {
        await Promise.all(
          toDelete.map((sid) =>
            supabase.from("attendance").delete().eq("student_id", sid).eq("date", selectedDate).eq("session", SESSION)
          )
        );
      }

      setOriginalAttendance(attendanceSnapshot);
      setOriginalRemarks(remarksSnapshot);
      if (draftStorageKey) {
        sessionStorage.removeItem(draftStorageKey);
        loadedDraftKeyRef.current = null;
      }
      toast.success("Attendance saved!");
      setConfirmOpen(false);
    } catch (err: any) {
      toast.error("Save failed: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }

    void (async () => {
      try {
        if (changedStudents.length > 0) {
          const studentMap = new Map(students.map((s) => [s.id, s.student_name]));
          await logActivityBatch(
            changedStudents.slice(0, 50).map((sid) => ({
              userId: user.id,
              userEmail: user.email ?? "",
              userName: user.user_metadata?.full_name ?? user.email ?? "",
              action: `${SESSION} attendance marked`,
              studentName: studentMap.get(sid) ?? "",
              studentId: sid,
              details: { date: selectedDate, session: SESSION, status: attendanceSnapshot[sid], remark: remarksSnapshot[sid] || "" },
            }))
          );
        }
      } catch {}
      try {
        await queueAttendanceSheetSync(selectedDate);
      } catch {}
    })();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheet", { body: { dataset_slug: activeSlug } });
      if (error) throw error;
      toast.success(`Synced ${data?.synced ?? 0} students`);
      const stuRes = await supabase.from("students").select("id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status").eq("dataset", activeSlug);
      setStudents(stuRes.data ?? []);
    } catch (err: any) {
      toast.error("Sync failed: " + (err.message || "Unknown"));
    }
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
    <button
      disabled={!canEdit}
      onClick={() => toggleStatus(studentId, status)}
      className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${attendance[studentId] === status ? color : "bg-muted text-muted-foreground hover:bg-muted/80"} ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button aria-label="Back to dashboard" onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Mark Attendance</h1>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{activeName}</span>
            </div>
            <p className="text-sm text-muted-foreground">{filteredStudents.length} students</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={() => { setAttendance({}); setRemarks({}); }} className="gap-1.5">
            <Trash2 className="h-4 w-4" /> Clear All
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync Sheet
          </Button>
        </div>
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
        <div className="rounded-lg border border-blue-400/30 bg-blue-100/10 p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{hCount}</p>
          <p className="text-xs text-muted-foreground">Holiday</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{filteredStudents.length - markedCount}</p>
          <p className="text-xs text-muted-foreground">Unmarked</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Marked: {markedCount} / {filteredStudents.length}</span>
          <div className="flex gap-3 text-xs">
            <span className="text-success font-bold">P:{pCount}</span>
            <span className="text-destructive font-bold">A:{abCount}</span>
            <span className="text-blue-600 font-bold">H:{hCount}</span>
          </div>
        </div>
        <Progress value={pct} className="h-2.5" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Enrollment" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Enrollment</SelectItem><SelectItem value="ENROLLED">ENROLLED</SelectItem><SelectItem value="FORFEITED">FORFEITED</SelectItem></SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or roll no..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Button variant={showUnmarkedOnly ? "default" : "outline"} size="sm" onClick={() => setShowUnmarkedOnly(!showUnmarkedOnly)}>Show Unmarked Only</Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="P">Present</SelectItem>
              <SelectItem value="A">Absent</SelectItem>
              <SelectItem value="H">Half Day</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-2">Mark all:</span>
          <Button variant="outline" size="sm" className="gap-1 text-success border-success/30 hover:bg-success/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "P"; }); setAttendance(u); }}>
            <CheckCircle className="h-3.5 w-3.5" /> All Present
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "A"; }); setAttendance(u); }}>
            <XCircle className="h-3.5 w-3.5" /> All Absent
          </Button>
          <Button variant="outline" size="sm" className="gap-1 border-purple-300 hover:bg-purple-50 text-purple-600" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "H"; }); setAttendance(u); }}>
            🏖 All Holiday
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-muted-foreground border-muted-foreground/30 hover:bg-muted" onClick={() => {
            const u = { ...attendance }; const r = { ...remarks };
            filteredStudents.forEach((s) => { delete u[s.id]; delete r[s.id]; });
            setAttendance(u); setRemarks(r);
            toast.info(`Unmarked ${filteredStudents.length} students`);
          }}>
            <Trash2 className="h-3.5 w-3.5" /> Unmark
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={viewMode === "card" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setViewMode("card")}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {!canEdit && selectedDate !== today && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          ⚠️ You can only edit today's attendance. Past dates are view-only for non-owners.
        </div>
      )}

      {viewMode === "card" ? (
        <div className="space-y-6">
          {groupedByClassroom.map((g) => (
            <div key={g.classroom}>
              <div className="sticky top-0 z-10 mb-2 rounded-md bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary backdrop-blur">
                📚 {g.classroom} <span className="text-muted-foreground font-medium">({g.students.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.students.map((s) => (
            <div key={s.id} className={`rounded-xl border p-3 transition-all ${attendance[s.id] === "P" ? "border-success/50 bg-success/5" : attendance[s.id] === "A" ? "border-destructive/50 bg-destructive/5" : attendance[s.id] === "H" ? "border-purple-400/50 bg-purple-50" : "border-border bg-card"}`}>
              <div className="mb-2">
                <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{s.roll_no}</span>
                <p className="mt-1 text-sm font-semibold text-foreground truncate">{s.student_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.grade} · {s.curriculum} · {s.classroom_name}</p>
              </div>
              <div className="flex gap-1">
                {statusBtn(s.id, "P", "P", "bg-success text-success-foreground")}
                {statusBtn(s.id, "A", "A", "bg-destructive text-destructive-foreground")}
                {statusBtn(s.id, "H", "H", "bg-purple-600 text-primary-foreground")}
              </div>
              {remarks[s.id] && (
                <button onClick={() => setRemarkDialogStudent(s)}
                  className="mt-2 w-full flex items-center gap-1.5 rounded-md border border-muted bg-muted/50 px-2 py-1.5 text-xs text-left transition-colors hover:bg-muted">
                  <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{remarks[s.id]}</span>
                </button>
              )}
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 backdrop-blur">
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Roll No</th>
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Student Name</th>
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Grade</th>
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Curriculum</th>
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Classroom</th>
                <th className="px-3 py-2.5 text-center font-semibold text-foreground">STATUS</th>
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">Remark</th>
              </tr>
            </thead>
            <tbody>
              {groupedByClassroom.map((g) => (
                <>
                  <tr key={`hdr-${g.classroom}`} className="border-t border-border bg-primary/10">
                    <td colSpan={7} className="px-3 py-2 text-xs font-bold text-primary">📚 {g.classroom} <span className="text-muted-foreground font-medium">({g.students.length})</span></td>
                  </tr>
                  {g.students.map((s, i) => (
                <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 font-medium text-foreground">{s.roll_no}</td>
                  <td className="px-3 py-2.5 text-foreground">{s.student_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.grade}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.curriculum}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.classroom_name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-center gap-1.5">
                      {statusBtn(s.id, "P", "P", "bg-success text-success-foreground")}
                      {statusBtn(s.id, "A", "A", "bg-destructive text-destructive-foreground")}
                      {statusBtn(s.id, "H", "H", "bg-purple-600 text-primary-foreground")}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {remarks[s.id] ? (
                      <button onClick={() => setRemarkDialogStudent(s)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span className="truncate">{remarks[s.id]}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredStudents.length === 0 && <p className="py-12 text-center text-muted-foreground">No students found</p>}

      {/* Floating Save Button — opens confirmation modal */}
      {canEdit && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={saving}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-success px-6 py-3 text-sm font-bold text-success-foreground shadow-lg transition-all hover:scale-105 ${hasUnsavedChanges ? "animate-pulse" : ""}`}
        >
          <Save className="h-5 w-5" />
          Save Attendance
        </button>
      )}

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Attendance Submission</DialogTitle>
            <DialogDescription>Review and confirm the attendance data before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Batch:</span>
              <span className="font-semibold">{classroomFilter === "all" ? "All Classrooms" : classroomFilter}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-semibold">{selectedDate}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Present:</span>
              <span className="font-bold text-success">{pCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Absent:</span>
              <span className="font-bold text-destructive">{abCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Half Day:</span>
              <span className="font-bold text-purple-600">{hCount}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Final Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {remarkDialogStudent && (
        <RemarkDialog
          open={!!remarkDialogStudent}
          onOpenChange={(open) => { if (!open) setRemarkDialogStudent(null); }}
          studentName={remarkDialogStudent.student_name}
          rollNo={remarkDialogStudent.roll_no}
          grade={remarkDialogStudent.grade}
          classroom={remarkDialogStudent.classroom_name}
          date={selectedDate}
          currentRemark={remarks[remarkDialogStudent.id] || ""}
          onSave={(remark) => setRemarks((prev) => ({ ...prev, [remarkDialogStudent.id]: remark }))}
        />
      )}
    </div>
  );
};

export default AttendanceDashboard;

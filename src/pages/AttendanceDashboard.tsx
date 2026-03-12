import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, RefreshCw, Search, CheckCircle, XCircle, Clock, Trash2, LayoutGrid, List, ArrowLeft, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveDataset } from "@/hooks/useActiveDataset";

type Student = { id: string; roll_no: string; student_name: string; grade: string; curriculum: string; classroom_name: string; enrollment_status: string; };

const AttendanceDashboard = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { activeSlug, activeName } = useActiveDataset();
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [originalAttendance, setOriginalAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [enrollmentFilter, setEnrollmentFilter] = useState("ENROLLED");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnmarkedOnly, setShowUnmarkedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">(() => (localStorage.getItem("att-view") as any) || "table");
  const canEdit = selectedDate === today || userRole === "owner";

  useEffect(() => { localStorage.setItem("att-view", viewMode); }, [viewMode]);

  useEffect(() => {
    const fetchData = async () => {
      if (!activeSlug) return;
      setLoading(true);
      const [stuRes, attRes] = await Promise.all([
        supabase.from("students").select("id, roll_no, student_name, grade, curriculum, classroom_name, enrollment_status").neq("roll_no", "").eq("dataset", activeSlug),
        supabase.from("attendance").select("student_id, status").eq("date", selectedDate),
      ]);
      setStudents(stuRes.data ?? []);
      const map: Record<string, string> = {};
      (attRes.data ?? []).forEach((a: any) => { map[a.student_id] = a.status; });
      setAttendance(map);
      setOriginalAttendance(map);
      setLoading(false);
    };
    fetchData();
  }, [selectedDate, activeSlug]);

  const classrooms = useMemo(() => Array.from(new Set(students.map((s) => s.classroom_name).filter(Boolean))).sort(), [students]);
  const filteredStudents = useMemo(() => students.filter((s) => {
    if (enrollmentFilter !== "all" && s.enrollment_status !== enrollmentFilter) return false;
    if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
    if (searchQuery) { const q = searchQuery.toLowerCase(); if (!s.student_name.toLowerCase().includes(q) && !s.roll_no.toLowerCase().includes(q)) return false; }
    if (showUnmarkedOnly && attendance[s.id]) return false;
    return true;
  }).sort((a, b) => a.roll_no.localeCompare(b.roll_no)), [students, enrollmentFilter, classroomFilter, searchQuery, showUnmarkedOnly, attendance]);

  const hasUnsavedChanges = JSON.stringify(attendance) !== JSON.stringify(originalAttendance);
  const markedCount = filteredStudents.filter((s) => attendance[s.id]).length;
  const pct = filteredStudents.length > 0 ? Math.round((markedCount / filteredStudents.length) * 100) : 0;
  const pCount = filteredStudents.filter((s) => attendance[s.id] === "P").length;
  const abCount = filteredStudents.filter((s) => attendance[s.id] === "AB").length;
  const lCount = filteredStudents.filter((s) => attendance[s.id] === "L").length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const toUpsert = Object.entries(attendance).filter(([, status]) => status).map(([student_id, status]) => ({ student_id, date: selectedDate, status, marked_by: user.id }));
      const toDelete = Object.keys(originalAttendance).filter((sid) => !attendance[sid]);
      if (toUpsert.length > 0) { const { error } = await supabase.from("attendance").upsert(toUpsert, { onConflict: "student_id,date" }); if (error) throw error; }
      if (toDelete.length > 0) { for (const sid of toDelete) { await supabase.from("attendance").delete().eq("student_id", sid).eq("date", selectedDate); } }
      setOriginalAttendance({ ...attendance });
      toast.success("Attendance saved!");
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

  const statusBtn = (studentId: string, status: string, label: string, color: string) => (
    <button disabled={!canEdit} onClick={() => { setAttendance((prev) => { const current = prev[studentId]; if (current === status) { const { [studentId]: _, ...rest } = prev; return rest; } return { ...prev, [studentId]: status }; }); }}
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
          <Button variant="destructive" size="sm" onClick={() => { setAttendance({}); }} className="gap-1.5"><Trash2 className="h-4 w-4" /> Clear All</Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5"><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync Sheet</Button>
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
        <div className="flex items-center gap-2 text-sm">
          <Button variant={showUnmarkedOnly ? "default" : "outline"} size="sm" onClick={() => setShowUnmarkedOnly(!showUnmarkedOnly)}>Show Unmarked Only</Button>
          <span className="text-muted-foreground ml-2">Mark all:</span>
          <Button variant="outline" size="sm" className="gap-1 text-success border-success/30 hover:bg-success/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "P"; }); setAttendance(u); }}><CheckCircle className="h-3.5 w-3.5" /> All Present</Button>
          <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "AB"; }); setAttendance(u); }}><XCircle className="h-3.5 w-3.5" /> All Absent</Button>
          <Button variant="outline" size="sm" className="gap-1 border-purple-300 hover:bg-purple-50 text-purple-600" onClick={() => { const u = { ...attendance }; filteredStudents.forEach((s) => { u[s.id] = "H"; }); setAttendance(u); }}>🏖 All Holiday</Button>
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
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm"><thead><tr className="bg-muted/50"><th className="px-3 py-2.5 text-left font-semibold text-foreground">Roll No</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Student Name</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Grade</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Curriculum</th><th className="px-3 py-2.5 text-left font-semibold text-foreground">Classroom</th><th className="px-3 py-2.5 text-center font-semibold text-foreground">Attendance</th></tr></thead>
            <tbody>{filteredStudents.map((s, i) => (<tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}><td className="px-3 py-2.5 font-medium text-foreground">{s.roll_no}</td><td className="px-3 py-2.5 text-foreground">{s.student_name}</td><td className="px-3 py-2.5 text-muted-foreground">{s.grade}</td><td className="px-3 py-2.5 text-muted-foreground">{s.curriculum}</td><td className="px-3 py-2.5 text-muted-foreground">{s.classroom_name}</td><td className="px-3 py-2.5"><div className="flex justify-center gap-1.5">{statusBtn(s.id, "P", "P", "bg-success text-success-foreground")}{statusBtn(s.id, "AB", "AB", "bg-destructive text-destructive-foreground")}{statusBtn(s.id, "L", "L", "bg-warning text-warning-foreground")}{statusBtn(s.id, "H", "H", "bg-purple-600 text-primary-foreground")}</div></td></tr>))}</tbody></table>
        </div>
      )}
      {filteredStudents.length === 0 && <p className="py-12 text-center text-muted-foreground">No students found</p>}
      {canEdit && <button onClick={handleSave} disabled={saving} className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-success px-6 py-3 text-sm font-bold text-success-foreground shadow-lg transition-all hover:scale-105 ${hasUnsavedChanges ? "animate-pulse" : ""}`}>{saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save All</button>}
    </div>
  );
};

export default AttendanceDashboard;

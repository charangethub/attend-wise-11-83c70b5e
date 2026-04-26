import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Trash2, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageDataset } from "@/hooks/usePageDataset";
import { fetchDatasetStudents } from "@/lib/attendanceData";
import { logActivity } from "@/hooks/useActivityLog";
import { queueAttendanceSheetSync } from "@/lib/sheetSync";

type Student = { id: string; roll_no: string; student_name: string; classroom_name: string };
type Permission = {
  id: string;
  student_id: string;
  date: string;
  permission_type: string;
  reason: string;
  granted_by_name: string;
  student?: Student;
};

const PermissionEntry = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { datasetSlug: activeSlug } = usePageDataset("Permission Entry");
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Add dialog state
  const [dialogBatchFilter, setDialogBatchFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [permissionType, setPermissionType] = useState("Half Day Permission");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Monthly state
  const [monthYear, setMonthYear] = useState(format(new Date(), "yyyy-MM"));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    try {
      const stuRows = await fetchDatasetStudents<Student>(activeSlug, "id, roll_no, student_name, classroom_name");
      setStudents(stuRows);

      if (tab === "daily") {
        const { data } = await supabase
          .from("student_permissions" as any)
          .select("*")
          .eq("date", selectedDate)
          .eq("dataset", activeSlug);
        setPermissions((data as any[]) ?? []);
      } else {
        const start = format(startOfMonth(new Date(monthYear + "-01")), "yyyy-MM-dd");
        const end = format(endOfMonth(new Date(monthYear + "-01")), "yyyy-MM-dd");
        const { data } = await supabase
          .from("student_permissions" as any)
          .select("*")
          .gte("date", start)
          .lte("date", end)
          .eq("dataset", activeSlug);
        setPermissions((data as any[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeSlug, selectedDate, tab, monthYear]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const classrooms = useMemo(() => Array.from(new Set(students.map(s => s.classroom_name).filter(Boolean))).sort(), [students]);
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  const enrichedPermissions = useMemo(() =>
    permissions.map(p => ({ ...p, student: studentMap.get(p.student_id) }))
      .filter(p => {
        if (classroomFilter !== "all" && p.student?.classroom_name !== classroomFilter) return false;
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          if (!p.student?.student_name.toLowerCase().includes(q) && !p.student?.roll_no.toLowerCase().includes(q)) return false;
        }
        return true;
      })
  , [permissions, studentMap, classroomFilter, debouncedSearch]);

  const fullDayCount = enrichedPermissions.filter(p => p.permission_type === "Full Day Permission").length;
  const halfDayCount = enrichedPermissions.filter(p => p.permission_type === "Half Day Permission").length;

  // Student search for add dialog — filtered by batch
  const filteredStudents = useMemo(() => {
    let pool = students;
    if (dialogBatchFilter !== "all") {
      pool = pool.filter(s => s.classroom_name === dialogBatchFilter);
    }
    if (!studentSearch.trim()) return [];
    const q = studentSearch.toLowerCase();
    return pool.filter(s =>
      s.student_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [students, studentSearch, dialogBatchFilter]);

  const handleAdd = async () => {
    if (!selectedStudent || !user) { toast.error("Select a student"); return; }
    setSaving(true);
    try {
      // 1. Insert permission
      const { error } = await supabase.from("student_permissions" as any).insert({
        student_id: selectedStudent.id,
        date: selectedDate,
        permission_type: permissionType,
        reason: reason.trim(),
        granted_by: user.id,
        granted_by_name: user.user_metadata?.full_name ?? user.email ?? "",
        dataset: activeSlug,
      } as any);
      if (error) throw error;

      // 2. Auto-create attendance record (single session per day)
      const remarkText = reason.trim() || permissionType;
      // Half Day Permission => student attended (P) with remark; Full Day Permission => Leave (L)
      const status = permissionType === "Full Day Permission" ? "L" : "P";
      await supabase.from("attendance").upsert([
        { student_id: selectedStudent.id, date: selectedDate, session: "AM", status, marked_by: user.id, remark: remarkText },
      ] as any[], { onConflict: "student_id,date,session" });

      // 3. Log activity
      await logActivity({
        userId: user.id,
        userEmail: user.email ?? "",
        userName: user.user_metadata?.full_name ?? "",
        action: "permission_added",
        entityType: "student",
        entityId: selectedStudent.id,
        studentName: selectedStudent.student_name,
        studentId: selectedStudent.id,
        details: {
          roll_no: selectedStudent.roll_no,
          classroom: selectedStudent.classroom_name,
          permission_type: permissionType,
          reason: reason.trim(),
          date: selectedDate,
        },
      });

      toast.success("Permission added!");
      setAddOpen(false);
      setSelectedStudent(null);
      setStudentSearch("");
      setReason("");
      setDialogBatchFilter("all");
      void fetchData();
      void queueAttendanceSheetSync(selectedDate).catch((err) => console.warn("Permission sheet sync failed:", err));
    } catch (e: any) {
      toast.error("Failed: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    // The DB trigger trg_clear_attendance_on_permission_delete will also wipe attendance for that date
    const { error } = await supabase.from("student_permissions" as any).delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Permission removed and attendance cleared"); void fetchData(); }
  };

  const shiftDate = (d: number) => {
    const dt = new Date(selectedDate);
    dt.setDate(dt.getDate() + d);
    setSelectedDate(format(dt, "yyyy-MM-dd"));
  };

  // Monthly report aggregation
  const monthlyReport = useMemo(() => {
    if (tab !== "monthly") return [];
    const map: Record<string, { total: number; full: number; half: number; student: Student | undefined }> = {};
    permissions.forEach(p => {
      if (!map[p.student_id]) map[p.student_id] = { total: 0, full: 0, half: 0, student: studentMap.get(p.student_id) };
      map[p.student_id].total++;
      if (p.permission_type === "Full Day Permission") map[p.student_id].full++;
      else map[p.student_id].half++;
    });
    return Object.values(map).sort((a, b) => (b.total - a.total));
  }, [permissions, studentMap, tab]);

  return (
    <div className="w-full px-4 py-6 max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Permission Entry</h2>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant={tab === "daily" ? "default" : "outline"} size="sm" onClick={() => setTab("daily")} className="gap-1.5">
          <CalendarDays className="h-4 w-4" /> Daily Entry
        </Button>
        <Button variant={tab === "monthly" ? "default" : "outline"} size="sm" onClick={() => setTab("monthly")} className="gap-1.5">
          <FileText className="h-4 w-4" /> Monthly Report
        </Button>
      </div>

      {tab === "daily" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Select value={classroomFilter} onValueChange={setClassroomFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classrooms</SelectItem>
                {classrooms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search student..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Permission
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : enrichedPermissions.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No permissions recorded for this date.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-semibold">Roll No</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Student Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Classroom</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Permission Type</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Reason</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Added By</th>
                  {isAdminOrOwner && <th className="px-4 py-2.5 text-center font-semibold">Actions</th>}
                </tr></thead>
                <tbody>
                  {enrichedPermissions.map((p, i) => (
                    <tr key={p.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                      <td className="px-4 py-2.5 font-medium">{p.student?.roll_no ?? "—"}</td>
                      <td className="px-4 py-2.5">{p.student?.student_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.student?.classroom_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.permission_type === "Full Day Permission" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                          {p.permission_type === "Full Day Permission" ? "Full Day" : "Half Day"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">{p.reason || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.granted_by_name || "—"}</td>
                      {isAdminOrOwner && (
                        <td className="px-4 py-2.5 text-center">
                          <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)} className="h-7 w-7 p-0 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-sm text-muted-foreground">
            Total: {enrichedPermissions.length} permission(s) — Full Day: {fullDayCount}, Half Day: {halfDayCount}
          </p>
        </>
      )}

      {tab === "monthly" && (
        <>
          <div className="mb-4">
            <input type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : monthlyReport.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No permissions for this month.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-semibold">Student Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Roll No</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Classroom</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Total</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Full Day</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Half Day</th>
                </tr></thead>
                <tbody>
                  {monthlyReport.map((r, i) => (
                    <tr key={r.student?.id ?? i} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                      <td className="px-4 py-2.5 font-medium">{r.student?.student_name ?? "—"}</td>
                      <td className="px-4 py-2.5">{r.student?.roll_no ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.student?.classroom_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{r.total}</td>
                      <td className="px-4 py-2.5 text-center">{r.full}</td>
                      <td className="px-4 py-2.5 text-center">{r.half}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Permission Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setDialogBatchFilter("all"); setStudentSearch(""); setSelectedStudent(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Student Permission</DialogTitle>
            <DialogDescription>Search for a student and add a permission entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Filter by Batch</label>
              <Select value={dialogBatchFilter} onValueChange={(v) => { setDialogBatchFilter(v); setSelectedStudent(null); setStudentSearch(""); }}>
                <SelectTrigger><SelectValue placeholder="All Batches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {classrooms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Search Student</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type student name or roll no..."
                  value={studentSearch}
                  onChange={e => { setStudentSearch(e.target.value); setSelectedStudent(null); }}
                  className="pl-9"
                />
              </div>
              {studentSearch && !selectedStudent && filteredStudents.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-popover">
                  {filteredStudents.map(s => (
                    <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(s.student_name); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2">
                      <span className="font-medium">{s.student_name}</span>
                      <span className="text-xs text-muted-foreground">{s.roll_no} · {s.classroom_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedStudent && (
                <p className="mt-1 text-xs text-success">✓ Selected: {selectedStudent.student_name} ({selectedStudent.roll_no})</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Permission Type</label>
              <Select value={permissionType} onValueChange={setPermissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Half Day Permission">Half Day Permission</SelectItem>
                  <SelectItem value="Full Day Permission">Full Day Permission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason (optional)</label>
              <Textarea placeholder="e.g. Medical appointment, family event..." value={reason} onChange={e => setReason(e.target.value)} rows={3} />
            </div>
            <Button onClick={handleAdd} disabled={saving || !selectedStudent} className="w-full gap-1.5">
              <Plus className="h-4 w-4" /> {saving ? "Adding..." : "Add Permission"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissionEntry;

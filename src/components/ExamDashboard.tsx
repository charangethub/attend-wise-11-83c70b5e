import { useState, useMemo, useEffect, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Pencil, Search, Download } from "lucide-react";
import { toast } from "sonner";
import {
  ExamType, useExamMarks, getSubjectsForCurriculum,
  SUBJECTS_JEE, SUBJECTS_NEET, StudentRow,
} from "@/hooks/useExamMarks";

const COLORS: Record<ExamType, string> = {
  quarterly: "hsl(217, 91%, 50%)",
  half_yearly: "hsl(148, 63%, 30%)",
  pre_final_1: "hsl(21, 100%, 45%)",
  pre_final_2: "hsl(280, 60%, 45%)",
};

type EditState = Record<string, { max: string; obtained: string }>;

export default function ExamDashboard({ examType, title }: { examType: ExamType; title: string }) {
  const { students, marks, isLoading, datasetName, upsertMark, refetch } = useExamMarks(examType);
  const color = COLORS[examType];

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [editMarks, setEditMarks] = useState<EditState>({});
  const [saving, setSaving] = useState(false);

  // Build a map: userId -> { subject: { max, obtained } }
  const marksByStudent = useMemo(() => {
    const m = new Map<string, Record<string, { max: number; obtained: number }>>();
    for (const r of marks) {
      if (!m.has(r.student_user_id)) m.set(r.student_user_id, {});
      m.get(r.student_user_id)![r.subject] = { max: r.max_marks, obtained: r.obtained_marks };
    }
    return m;
  }, [marks]);

  const classrooms = useMemo(() => {
    const s = new Set<string>();
    for (const st of students) if (st.classroom) s.add(st.classroom);
    return Array.from(s).sort();
  }, [students]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const st of students) if (st.enrollmentStatus) s.add(st.enrollmentStatus);
    return Array.from(s).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter(s => {
      if (classFilter !== "all" && s.classroom !== classFilter) return false;
      if (statusFilter !== "all" && s.enrollmentStatus !== statusFilter) return false;
      if (!q) return true;
      return s.studentName.toLowerCase().includes(q)
        || s.rollNumber.toLowerCase().includes(q)
        || s.userId.toLowerCase().includes(q);
    }).sort((a, b) => {
      const c = (a.classroom || "").localeCompare(b.classroom || "");
      if (c !== 0) return c;
      return (a.rollNumber || "").localeCompare(b.rollNumber || "");
    });
  }, [students, search, classFilter, statusFilter]);

  const marksEnteredCount = useMemo(
    () => students.filter(s => marksByStudent.has(s.userId)).length,
    [students, marksByStudent]
  );

  const openEdit = (student: StudentRow) => {
    const subjects = getSubjectsForCurriculum(student.curriculum);
    const existing = marksByStudent.get(student.userId) ?? {};
    const initial: EditState = {};
    for (const sub of subjects) {
      initial[sub] = {
        max: existing[sub]?.max != null ? String(existing[sub].max) : "100",
        // CRITICAL: empty string, not "0", so the input is clearable
        obtained: existing[sub]?.obtained != null ? String(existing[sub].obtained) : "",
      };
    }
    setEditMarks(initial);
    setEditStudent(student);
  };

  const handleSave = async () => {
    if (!editStudent) return;
    const subjects = getSubjectsForCurriculum(editStudent.curriculum);
    const marksPayload: Record<string, { max: number; obtained: number }> = {};
    for (const sub of subjects) {
      const max = parseFloat(editMarks[sub]?.max ?? "") || 100;
      const obt = parseFloat(editMarks[sub]?.obtained ?? "") || 0;
      if (obt > max) {
        toast.error(`${sub}: obtained (${obt}) cannot exceed max (${max})`);
        return;
      }
      marksPayload[sub] = { max, obtained: obt };
    }
    setSaving(true);
    try {
      await upsertMark.mutateAsync({ student: editStudent, marks: marksPayload });
      toast.success(`Marks saved for ${editStudent.studentName}`);
      setEditStudent(null);
    } catch (e: any) {
      toast.error("Save failed: " + (e?.message ?? "Unknown error"));
    }
    setSaving(false);
  };

  const exportCsv = () => {
    const header = ['#', 'User ID', 'Roll No', 'Student Name', 'Curriculum', 'Grade', 'Classroom', 'Enrollment Status'];
    const subjectCols = ['Sanskrit', 'English', 'Maths A / Botany', 'Maths B / Zoology', 'Physics', 'Chemistry'];
    for (const s of subjectCols) { header.push(`${s} Max`); header.push(`${s} Obt`); }
    header.push('Total Max', 'Total Obt', '%');
    const lines = [header.join(',')];
    filteredStudents.forEach((s, i) => {
      const subs = getSubjectsForCurriculum(s.curriculum);
      const m = marksByStudent.get(s.userId) ?? {};
      let totMax = 0, totObt = 0;
      const cells = [
        i + 1, s.userId, s.rollNumber, s.studentName, s.curriculum, s.grade, s.classroom, s.enrollmentStatus
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`);
      for (const sub of subs) {
        const v = m[sub] ?? { max: 0, obtained: 0 };
        totMax += v.max; totObt += v.obtained;
        cells.push(String(v.max), String(v.obtained));
      }
      const pct = totMax > 0 ? ((totObt / totMax) * 100).toFixed(1) : '0';
      cells.push(String(totMax), String(totObt), pct);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color }}>{title}</h1>
          <p className="text-sm text-muted-foreground">Dataset: {datasetName || '—'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Students</div><div className="text-2xl font-bold" style={{ color }}>{students.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Marks Entered</div><div className="text-2xl font-bold" style={{ color }}>{marksEnteredCount} / {students.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Showing</div><div className="text-2xl font-bold" style={{ color }}>{filteredStudents.length}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name, roll no, user ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Classroom" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classrooms</SelectItem>
            {classrooms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">User ID</th>
              <th className="px-2 py-2 text-left">Roll No</th>
              <th className="px-2 py-2 text-left">Student Name</th>
              <th className="px-2 py-2 text-left">Curriculum</th>
              <th className="px-2 py-2 text-left">Grade</th>
              <th className="px-2 py-2 text-left">Classroom</th>
              <th className="px-2 py-2 text-left">Status</th>
              {['Sanskrit', 'English', 'Maths A / Botany', 'Maths B / Zoology', 'Physics', 'Chemistry'].map(s => (
                <th key={s} colSpan={2} className="px-2 py-2 text-center border-l border-border">{s}</th>
              ))}
              <th className="px-2 py-2 text-center border-l border-border">Total Max</th>
              <th className="px-2 py-2 text-center">Total Obt</th>
              <th className="px-2 py-2 text-center">%</th>
              <th className="px-2 py-2 text-center">Action</th>
            </tr>
            <tr className="text-[10px] bg-muted/50">
              <th colSpan={8}></th>
              {Array.from({ length: 6 }).map((_, i) => (
                <>
                  <th key={`max-${i}`} className="px-1 py-1 border-l border-border">Max</th>
                  <th key={`obt-${i}`} className="px-1 py-1">Obt</th>
                </>
              ))}
              <th colSpan={4}></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s, i, arr) => {
              const subs = getSubjectsForCurriculum(s.curriculum);
              const m = marksByStudent.get(s.userId) ?? {};
              let totMax = 0, totObt = 0;
              for (const sub of subs) { totMax += m[sub]?.max ?? 0; totObt += m[sub]?.obtained ?? 0; }
              const pct = totMax > 0 ? ((totObt / totMax) * 100).toFixed(1) : '0.0';
              const showHeader = !arr[i - 1] || arr[i - 1].classroom !== s.classroom;
              const groupCount = arr.filter(x => x.classroom === s.classroom).length;
              const colCount = 8 + subs.length * 2 + 4;
              return (
                <Fragment key={s.userId || i}>
                  {showHeader && (
                    <tr className="bg-primary/10">
                      <td colSpan={colCount} className="px-2 py-1.5 text-xs font-bold text-primary">📚 {s.classroom || "Unassigned"} <span className="text-muted-foreground font-medium">({groupCount})</span></td>
                    </tr>
                  )}
                  <tr className={i % 2 ? 'bg-muted/10' : ''}>
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{s.userId}</td>
                  <td className="px-2 py-1.5">{s.rollNumber}</td>
                  <td className="px-2 py-1.5 font-semibold">{s.studentName}</td>
                  <td className="px-2 py-1.5">{s.curriculum}</td>
                  <td className="px-2 py-1.5">{s.grade}</td>
                  <td className="px-2 py-1.5">{s.classroom}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{s.enrollmentStatus}</Badge></td>
                  {subs.map(sub => {
                    const v = m[sub];
                    return (
                      <>
                        <td key={`${sub}-max`} className="px-1 py-1.5 text-center border-l border-border">{v?.max ?? '-'}</td>
                        <td key={`${sub}-obt`} className="px-1 py-1.5 text-center font-semibold">{v?.obtained ?? '-'}</td>
                      </>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center border-l border-border">{totMax || '-'}</td>
                  <td className="px-2 py-1.5 text-center font-bold" style={{ color }}>{totObt || '-'}</td>
                  <td className="px-2 py-1.5 text-center font-bold">{totMax > 0 ? `${pct}%` : '-'}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(s)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  </td>
                </tr>
                </Fragment>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr><td colSpan={22} className="text-center py-8 text-muted-foreground">No students found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editStudent} onOpenChange={(o) => !o && setEditStudent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Marks — {editStudent?.studentName}</DialogTitle>
          </DialogHeader>
          {editStudent && (
            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground">
                {editStudent.curriculum} · {editStudent.grade} · {editStudent.classroom}
              </div>
              {getSubjectsForCurriculum(editStudent.curriculum).map(sub => (
                <div key={sub} className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-sm">{sub}</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={editMarks[sub]?.max ?? ""}
                    onChange={(e) => setEditMarks(prev => ({ ...prev, [sub]: { ...prev[sub], max: e.target.value, obtained: prev[sub]?.obtained ?? "" } }))}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Obtained"
                    value={editMarks[sub]?.obtained ?? ""}
                    onChange={(e) => setEditMarks(prev => ({ ...prev, [sub]: { ...prev[sub], obtained: e.target.value, max: prev[sub]?.max ?? "100" } }))}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStudent(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</> : "Save Marks"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
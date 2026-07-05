import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, Info, ClipboardList, Users, Trophy, Download } from "lucide-react";
import { useResultsData } from "@/hooks/useResultsData";
import { usePageDataset } from "@/hooks/usePageDataset";
import { format } from "date-fns";

const RESULTS_COLOR = "hsl(243, 75%, 55%)"; // indigo

// sessionStorage-backed useState so filters persist across tab switches
function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function pickField(info: Record<string, string>, ...keys: string[]): string {
  const lower = Object.fromEntries(Object.entries(info).map(([k, v]) => [k.toLowerCase().trim(), v]));
  for (const k of keys) {
    const v = lower[k.toLowerCase().trim()];
    if (v != null && String(v).length) return String(v);
  }
  return "";
}

function performanceBadge(pct: number) {
  if (pct >= 90) return { label: "Excellent", cls: "bg-green-500/10 text-green-700 border-green-500/30" };
  if (pct >= 75) return { label: "Good", cls: "bg-purple-500/10 text-purple-700 border-purple-500/30" };
  if (pct >= 50) return { label: "Average", cls: "bg-yellow-500/10 text-yellow-800 border-yellow-500/30" };
  return { label: "Needs Improvement", cls: "bg-red-500/10 text-red-700 border-red-500/30" };
}

function getMaxFor(r: Record<string, string>): number {
  const maxKey = Object.keys(r).find(k => k.toLowerCase() === 'max' || k.toLowerCase() === 'max total' || k.toLowerCase() === 'max marks');
  if (maxKey) {
    const v = parseFloat(r[maxKey]);
    if (isFinite(v) && v > 0) return v;
  }
  // Sum subject-level "Max" sub-headers if present (e.g., "Physics Max")
  let sum = 0;
  for (const [k, v] of Object.entries(r)) {
    if (/max/i.test(k)) {
      const n = parseFloat(v);
      if (isFinite(n)) sum += n;
    }
  }
  return sum > 0 ? sum : 0;
}

function getTotalFor(r: Record<string, string>): number {
  const totalKey = Object.keys(r).find(k => k.toLowerCase() === 'total' || k.toLowerCase() === 'total marks');
  if (totalKey) {
    const v = parseFloat(r[totalKey]);
    if (isFinite(v)) return v;
  }
  return NaN;
}

export default function ResultsDashboard() {
  const navigate = useNavigate();
  const { datasetSlug } = usePageDataset("Results Dashboard");
  const { data, isLoading, isError, error, refetch, isFetching } = useResultsData(datasetSlug);

  const [search, setSearch] = usePersistentState<string>("results:search", "");
  const [classFilter, setClassFilter] = usePersistentState<string>("results:class", "all");
  const [currFilter, setCurrFilter] = usePersistentState<string>("results:curr", "all");
  const [testFilter, setTestFilter] = usePersistentState<string>("results:test", "__latest__");

  const students = data?.students ?? [];
  const testNames = data?.testNames ?? [];

  const classrooms = useMemo(() => Array.from(new Set(students.map(s => pickField(s.info, "Classroom Name", "Classroom")).filter(Boolean))).sort(), [students]);
  const curricula = useMemo(() => Array.from(new Set(students.map(s => pickField(s.info, "Curriculium", "Curriculum")).filter(Boolean))).sort(), [students]);

  // Determine "latest" test = last test name with at least 1 student having score>0
  const latestTest = useMemo(() => {
    for (let i = testNames.length - 1; i >= 0; i--) {
      const t = testNames[i];
      const has = students.some(s => {
        const r = s.results[t] ?? {};
        return getTotalFor(r) > 0;
      });
      if (has) return t;
    }
    return testNames[0] ?? "";
  }, [students, testNames]);

  const activeTest = testFilter === "__latest__" ? latestTest : testFilter;

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter(s => {
      const cls = pickField(s.info, "Classroom Name", "Classroom");
      const curr = pickField(s.info, "Curriculium", "Curriculum");
      if (classFilter !== "all" && cls !== classFilter) return false;
      if (currFilter !== "all" && curr !== currFilter) return false;
      if (!q) return true;
      const name = pickField(s.info, "Student Name", "Name");
      const roll = pickField(s.info, "Roll No", "Roll Number");
      const uid = pickField(s.info, "User ID", "user_id_vedantu");
      return name.toLowerCase().includes(q) || roll.toLowerCase().includes(q) || uid.toLowerCase().includes(q);
    });
  }, [students, search, classFilter, currFilter]);

  // Category-wise performance: grouped by Classroom. Each card uses that classroom's
  // OWN latest test (the last test in the sheet order that has at least 1 valid score
  // for a student in that classroom), so toppers are current per class.
  const categoryStats = useMemo(() => {
    const groups = new Map<string, { classroom: string; curr: string; grade: string; students: typeof filteredStudents }>();
    for (const s of filteredStudents) {
      const classroom = pickField(s.info, "Classroom Name", "Classroom");
      const curr = pickField(s.info, "Curriculium", "Curriculum");
      const grade = pickField(s.info, "Grade");
      if (!classroom) continue;
      if (!groups.has(classroom)) groups.set(classroom, { classroom, curr, grade, students: [] as any });
      (groups.get(classroom)!.students as any).push(s);
    }
    const out: { key: string; classroom: string; curr: string; grade: string; test: string; avg: number; max: number; topper: { name: string; score: number; userId: string } | null; count: number }[] = [];
    for (const [key, g] of groups) {
      // find latest test with a score in this classroom
      let latest = "";
      for (let i = testNames.length - 1; i >= 0; i--) {
        const t = testNames[i];
        if ((g.students as any[]).some(s => getTotalFor(s.results[t] ?? {}) > 0)) { latest = t; break; }
      }
      if (!latest) continue;
      const scores: { name: string; score: number; max: number; userId: string }[] = [];
      for (const s of g.students as any[]) {
        const r = s.results[latest] ?? {};
        const score = getTotalFor(r);
        if (!isFinite(score) || score <= 0) continue;
        let max = getMaxFor(r);
        if (max <= 0) max = g.curr.toUpperCase().includes('NEET') ? 720 : 300;
        scores.push({
          name: pickField(s.info, "Student Name", "Name"),
          score, max,
          userId: pickField(s.info, "User ID", "user_id_vedantu"),
        });
      }
      if (!scores.length) continue;
      const totalScore = scores.reduce((a, b) => a + b.score, 0);
      const totalMax = scores.reduce((a, b) => a + b.max, 0);
      const topper = scores.reduce((a, b) => b.score > a.score ? b : a);
      out.push({
        key, classroom: g.classroom, curr: g.curr, grade: g.grade, test: latest,
        avg: totalScore / scores.length, max: totalMax / scores.length,
        topper: { name: topper.name, score: topper.score, userId: topper.userId },
        count: scores.length,
      });
    }
    return out.sort((a, b) => {
      const ja = a.curr.toUpperCase().includes('JEE') ? 0 : 1;
      const jb = b.curr.toUpperCase().includes('JEE') ? 0 : 1;
      if (ja !== jb) return ja - jb;
      return a.classroom.localeCompare(b.classroom);
    });
  }, [filteredStudents, testNames]);

  // Overall topper across all students for active test
  const topPerformer = useMemo(() => {
    if (!activeTest) return null;
    let best: { name: string; score: number; userId: string } | null = null;
    for (const s of filteredStudents) {
      const r = s.results[activeTest] ?? {};
      const score = getTotalFor(r);
      if (!isFinite(score)) continue;
      const name = pickField(s.info, "Student Name", "Name");
      const userId = pickField(s.info, "User ID", "user_id_vedantu");
      if (!best || score > best.score) best = { name, score, userId };
    }
    return best;
  }, [filteredStudents, activeTest]);

  // Class average (all students with valid score for activeTest)
  const classAverage = useMemo(() => {
    if (!activeTest) return { avg: 0, max: 0 };
    let sum = 0, sumMax = 0, n = 0;
    for (const s of filteredStudents) {
      const r = s.results[activeTest] ?? {};
      const score = getTotalFor(r);
      if (!isFinite(score)) continue;
      const curr = pickField(s.info, "Curriculium", "Curriculum");
      let max = getMaxFor(r);
      if (max <= 0) max = curr.toUpperCase().includes('NEET') ? 720 : 300;
      sum += score; sumMax += max; n++;
    }
    return { avg: n ? sum / n : 0, max: n ? sumMax / n : 0 };
  }, [filteredStudents, activeTest]);

  const exportCsv = () => {
    const headers = ["#", "User ID", "Roll No", "Student Name", "Curriculum", "Grade", "Classroom", "Enrollment Status", "Score", "Max", "%", "Performance"];
    const lines = [headers.join(",")];
    filteredStudents.forEach((s, i) => {
      const r = s.results[activeTest] ?? {};
      const score = getTotalFor(r);
      const curr = pickField(s.info, "Curriculium", "Curriculum");
      let max = getMaxFor(r);
      if (max <= 0) max = curr.toUpperCase().includes('NEET') ? 720 : 300;
      const pct = isFinite(score) && max > 0 ? (score / max) * 100 : 0;
      const cells = [
        i + 1,
        pickField(s.info, "User ID", "user_id_vedantu"),
        pickField(s.info, "Roll No", "Roll Number"),
        pickField(s.info, "Student Name", "Name"),
        curr,
        pickField(s.info, "Grade"),
        pickField(s.info, "Classroom Name", "Classroom"),
        pickField(s.info, "Enrollment Status", "Status"),
        isFinite(score) ? score : '',
        max || '',
        isFinite(score) ? pct.toFixed(1) + '%' : '',
        isFinite(score) ? performanceBadge(pct).label : '',
      ];
      lines.push(cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Results_${activeTest || 'all'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6">
          <h2 className="text-lg font-bold text-destructive">Failed to load results</h2>
          <p className="text-sm text-muted-foreground mt-2">{(error as any)?.message ?? "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4 gap-1.5"><RefreshCw className="h-4 w-4" /> Retry</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: RESULTS_COLOR }}>
            <ClipboardList className="h-6 w-6" /> Student Results Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            {data?.fetchedAt ? `Last updated ${format(new Date(data.fetchedAt), "dd MMM yyyy, hh:mm a")}` : ""}
            {data?.gidUsed ? ` · GID ${data.gidUsed}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Info className="h-3 w-3" /> Results are filtered by Classroom and Curriculum (JEE / NEET). Use the filters below to scope the view.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!students.length} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {students.length === 0 ? (
        <Card><CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">No results data found.</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please check that your Google Sheet has a Results tab with test headers (RT-01, UT-01) in Row 1, sub-headers (Physics, Chemistry, Total, Max…) in Row 2, and that the correct GID is set in <strong>Admin → System Settings → "Results Sheet Tab GID"</strong>.
              </p>
              {data?.error && <p className="text-xs text-destructive mt-2">Edge function: {data.error}</p>}
            </div>
          </div>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase">Total Students</div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: RESULTS_COLOR }}>
                {filteredStudents.length}
                {filteredStudents.length !== students.length && (
                  <span className="text-sm font-normal text-muted-foreground"> / {students.length}</span>
                )}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase">Tests Conducted</div>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: RESULTS_COLOR }}>{testNames.length}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Class Avg ({activeTest || '—'})</div>
              <div className="text-2xl font-bold mt-1" style={{ color: RESULTS_COLOR }}>
                {classAverage.avg.toFixed(1)}
                <span className="text-sm text-muted-foreground font-normal"> / {classAverage.max.toFixed(0)}</span>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase">Top Performer</div>
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-sm font-bold mt-1 truncate" style={{ color: RESULTS_COLOR }}>{topPerformer?.name || '—'}</div>
              {topPerformer && <div className="text-xs text-muted-foreground">Score: {topPerformer.score}</div>}
            </CardContent></Card>
          </div>

          {categoryStats.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Classroom Toppers <span className="text-xs font-normal text-muted-foreground">(each classroom's latest test)</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoryStats.map(c => {
                  const pct = c.max > 0 ? (c.avg / c.max) * 100 : 0;
                  const isJee = c.curr.toUpperCase().includes("JEE");
                  const cardColor = isJee ? "hsl(217, 91%, 50%)" : "hsl(148, 63%, 40%)";
                  const gradient = isJee
                    ? "linear-gradient(135deg, hsl(217 91% 50% / 0.12), hsl(263 80% 60% / 0.08))"
                    : "linear-gradient(135deg, hsl(148 63% 40% / 0.14), hsl(180 60% 45% / 0.08))";
                  return (
                    <Card key={c.key} className="overflow-hidden border-2" style={{ borderColor: `${cardColor}33` }}>
                      <CardContent className="p-4" style={{ background: gradient }}>
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <Badge style={{ backgroundColor: cardColor, color: "white" }} className="shrink-0">
                            {isJee ? 'JEE' : 'NEET'} · G{c.grade}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{c.count} students</span>
                        </div>
                        <div className="text-[11px] font-semibold text-foreground/80 mb-1 truncate" title={c.classroom}>{c.classroom}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest: {c.test}</div>
                        <div className="text-2xl font-bold mt-1" style={{ color: cardColor }}>
                          {c.avg.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {c.max.toFixed(0)} ({pct.toFixed(1)}%)</span>
                        </div>
                      {c.topper && (
                        <p className="text-xs mt-2 flex items-center gap-1 pt-2 border-t border-border/40">
                          <Trophy className="h-3 w-3 text-amber-500" /> Topper:{' '}
                          <button className="font-semibold hover:underline" onClick={() => c.topper!.userId && navigate(`/results/student/${encodeURIComponent(c.topper!.userId)}`)}>
                            {c.topper.name}
                          </button>{' '}
                          <span className="font-bold" style={{ color: cardColor }}>({c.topper.score})</span>
                        </p>
                      )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by name, roll no, user ID..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Classroom" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={currFilter} onValueChange={setCurrFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Curriculum" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Curricula</SelectItem>{curricula.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={testFilter} onValueChange={setTestFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Test" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__latest__">Latest Test ({latestTest || '—'})</SelectItem>
                {testNames.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
                  <th className="px-2 py-2 text-left">Stream</th>
                  <th className="px-2 py-2 text-left">Grade</th>
                  <th className="px-2 py-2 text-left">Classroom</th>
                  <th className="px-2 py-2 text-center">Score</th>
                  <th className="px-2 py-2 text-center">Max</th>
                  <th className="px-2 py-2 text-center">%</th>
                  <th className="px-2 py-2 text-center">Performance</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s, i) => {
                  const r = s.results[activeTest] ?? {};
                  const score = getTotalFor(r);
                  const curr = pickField(s.info, "Curriculium", "Curriculum");
                  let max = getMaxFor(r);
                  if (max <= 0) max = curr.toUpperCase().includes('NEET') ? 720 : 300;
                  const pct = isFinite(score) && max > 0 ? (score / max) * 100 : 0;
                  const badge = performanceBadge(pct);
                  const userId = pickField(s.info, "User ID", "user_id_vedantu");
                  return (
                    <tr key={userId || i} className={i % 2 ? 'bg-muted/10' : ''}>
                      <td className="px-2 py-1.5">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono">{userId}</td>
                      <td className="px-2 py-1.5">{pickField(s.info, "Roll No", "Roll Number")}</td>
                      <td className="px-2 py-1.5 font-semibold">
                        <button className="hover:underline text-left" style={{ color: RESULTS_COLOR }} onClick={() => userId && navigate(`/results/student/${encodeURIComponent(userId)}`)}>
                          {pickField(s.info, "Student Name", "Name")}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">{pickField(s.info, "Curriculium", "Curriculum")}</td>
                      <td className="px-2 py-1.5">
                        {curr && (
                          <Badge style={{ backgroundColor: curr.toUpperCase().includes('NEET') ? 'hsl(148, 63%, 30%)' : 'hsl(217, 91%, 50%)', color: 'white' }}>
                            {curr.toUpperCase().includes('NEET') ? 'NEET' : 'JEE'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{pickField(s.info, "Grade")}</td>
                      <td className="px-2 py-1.5">{pickField(s.info, "Classroom Name", "Classroom")}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{isFinite(score) && score > 0 ? score : <span className="text-muted-foreground text-[10px]">No score</span>}</td>
                      <td className="px-2 py-1.5 text-center">{isFinite(max) && max > 0 ? max : '—'}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{isFinite(score) && score > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {isFinite(score) && score > 0 ? <Badge variant="outline" className={badge.cls}>{badge.label}</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">No students match filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
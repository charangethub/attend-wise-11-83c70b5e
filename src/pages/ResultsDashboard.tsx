import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, Info, ClipboardList } from "lucide-react";
import { useResultsData } from "@/hooks/useResultsData";
import { usePageDataset } from "@/hooks/usePageDataset";
import { format } from "date-fns";

const RESULTS_COLOR = "hsl(243, 75%, 55%)"; // indigo

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
  if (pct >= 50) return { label: "Average", cls: "bg-orange-500/10 text-orange-700 border-orange-500/30" };
  if (pct < 35) return { label: "Below Average", cls: "bg-red-500/10 text-red-700 border-red-500/30" };
  return { label: "Needs Improvement", cls: "bg-yellow-500/10 text-yellow-800 border-yellow-500/30" };
}

export default function ResultsDashboard() {
  const navigate = useNavigate();
  const { datasetSlug } = usePageDataset("Results Dashboard");
  const { data, isLoading, isError, error, refetch, isFetching } = useResultsData(datasetSlug);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [currFilter, setCurrFilter] = useState("all");
  const [testFilter, setTestFilter] = useState<string>("__latest__");

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
        const totalKey = Object.keys(r).find(k => k.toLowerCase() === 'total') ?? Object.keys(r)[0];
        return totalKey ? parseFloat(r[totalKey]) > 0 : false;
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

  // Category-wise performance: { JEE/NEET × Grade 11/12 }
  const categoryStats = useMemo(() => {
    if (!activeTest) return [] as { key: string; curr: string; grade: string; avg: number; max: number; topper: { name: string; score: number } | null; count: number }[];
    const groups = new Map<string, { curr: string; grade: string; scores: { name: string; score: number; max: number }[] }>();
    for (const s of students) {
      const curr = pickField(s.info, "Curriculium", "Curriculum");
      const grade = pickField(s.info, "Grade");
      const name = pickField(s.info, "Student Name", "Name");
      if (!curr || !grade) continue;
      const r = s.results[activeTest] ?? {};
      const totalKey = Object.keys(r).find(k => k.toLowerCase() === 'total') ?? Object.keys(r)[0];
      const maxKey = Object.keys(r).find(k => k.toLowerCase() === 'max');
      const score = totalKey ? parseFloat(r[totalKey]) : NaN;
      const max = maxKey ? parseFloat(r[maxKey]) : 100;
      if (!isFinite(score)) continue;
      const key = `${curr}|${grade}`;
      if (!groups.has(key)) groups.set(key, { curr, grade, scores: [] });
      groups.get(key)!.scores.push({ name, score, max: isFinite(max) ? max : 100 });
    }
    return Array.from(groups.entries()).map(([key, g]) => {
      const totalScore = g.scores.reduce((a, b) => a + b.score, 0);
      const totalMax = g.scores.reduce((a, b) => a + b.max, 0);
      const topper = g.scores.length ? g.scores.reduce((a, b) => b.score > a.score ? b : a) : null;
      return {
        key,
        curr: g.curr,
        grade: g.grade,
        avg: totalScore / Math.max(g.scores.length, 1),
        max: totalMax / Math.max(g.scores.length, 1),
        topper: topper ? { name: topper.name, score: topper.score } : null,
        count: g.scores.length,
      };
    });
  }, [students, activeTest]);

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
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
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
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Students</div><div className="text-2xl font-bold" style={{ color: RESULTS_COLOR }}>{students.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tests Conducted</div><div className="text-2xl font-bold" style={{ color: RESULTS_COLOR }}>{testNames.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Showing</div><div className="text-2xl font-bold" style={{ color: RESULTS_COLOR }}>{filteredStudents.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active Test</div><div className="text-lg font-bold" style={{ color: RESULTS_COLOR }}>{activeTest || '—'}</div></CardContent></Card>
          </div>

          {categoryStats.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Category Performance — {activeTest}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {categoryStats.map(c => {
                  const pct = c.max > 0 ? (c.avg / c.max) * 100 : 0;
                  const isJee = c.curr.toUpperCase().includes("JEE");
                  const cardColor = isJee ? "hsl(217, 91%, 50%)" : "hsl(148, 63%, 30%)";
                  return (
                    <Card key={c.key}><CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <Badge style={{ backgroundColor: cardColor, color: "white" }}>{c.curr} · Grade {c.grade}</Badge>
                        <span className="text-xs text-muted-foreground">{c.count} students</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: cardColor }}>
                        {c.avg.toFixed(1)} / {c.max.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">({pct.toFixed(1)}%)</span>
                      </div>
                      {c.topper && <p className="text-xs mt-1">🏆 Topper: <span className="font-semibold">{c.topper.name}</span> ({c.topper.score})</p>}
                    </CardContent></Card>
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
                  const totalKey = Object.keys(r).find(k => k.toLowerCase() === 'total') ?? Object.keys(r)[0];
                  const maxKey = Object.keys(r).find(k => k.toLowerCase() === 'max');
                  const score = totalKey ? parseFloat(r[totalKey]) : NaN;
                  const max = maxKey ? parseFloat(r[maxKey]) : 100;
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
                      <td className="px-2 py-1.5">{pickField(s.info, "Grade")}</td>
                      <td className="px-2 py-1.5">{pickField(s.info, "Classroom Name", "Classroom")}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{isFinite(score) ? score : '-'}</td>
                      <td className="px-2 py-1.5 text-center">{isFinite(max) ? max : '-'}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{isFinite(score) ? `${pct.toFixed(1)}%` : '-'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {isFinite(score) && score > 0 ? <Badge variant="outline" className={badge.cls}>{badge.label}</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No students match filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus, Trophy, AlertTriangle, Target } from "lucide-react";
import { useResultsData } from "@/hooks/useResultsData";
import { usePageDataset } from "@/hooks/usePageDataset";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CHART_COLOR = "hsl(217, 91%, 50%)";

function getMaxFor(r: Record<string, string>, fallback = 0): number {
  const maxKey = Object.keys(r).find(k => k.toLowerCase() === 'max' || k.toLowerCase() === 'max total' || k.toLowerCase() === 'max marks');
  if (maxKey) { const v = parseFloat(r[maxKey]); if (isFinite(v) && v > 0) return v; }
  return fallback;
}
function getTotalFor(r: Record<string, string>): number {
  const totalKey = Object.keys(r).find(k => k.toLowerCase() === 'total' || k.toLowerCase() === 'total marks');
  if (totalKey) { const v = parseFloat(r[totalKey]); if (isFinite(v)) return v; }
  return NaN;
}

export default function StudentDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { datasetSlug } = usePageDataset("Results Dashboard");
  const { data, isLoading } = useResultsData(datasetSlug);

  const student = useMemo(() => {
    if (!data || !userId) return null;
    return data.students.find(s => {
      const lower = Object.fromEntries(Object.entries(s.info).map(([k, v]) => [k.toLowerCase().trim(), v]));
      return (lower["user id"] ?? lower["user_id_vedantu"] ?? "") === userId;
    }) ?? null;
  }, [data, userId]);

  const get = (k: string): string => {
    if (!student) return "";
    return student.info[k] ?? Object.entries(student.info).find(([key]) => key.toLowerCase() === k.toLowerCase())?.[1] ?? "";
  };
  const curriculum = get("Curriculium") || get("Curriculum");
  const defaultMax = curriculum.toUpperCase().includes('NEET') ? 720 : 300;

  const testRows = useMemo(() => {
    if (!student || !data) return [] as { test: string; subjects: Record<string, number>; total: number; max: number; pct: number }[];
    return data.testNames.map(test => {
      const r = student.results[test] ?? {};
      const total = getTotalFor(r);
      const max = getMaxFor(r, defaultMax) || defaultMax;
      const subjects: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) {
        if (/^(total|max)/i.test(k)) continue;
        const n = parseFloat(v);
        if (isFinite(n)) subjects[k] = n;
      }
      const pct = isFinite(total) && max > 0 ? (total / max) * 100 : 0;
      return { test, subjects, total: isFinite(total) ? total : 0, max, pct };
    });
  }, [student, data, defaultMax]);

  const validRows = testRows.filter(r => r.total > 0 || Object.values(r.subjects).some(v => v > 0));

  const stats = useMemo(() => {
    if (validRows.length === 0) return null;
    const taken = validRows.length;
    const avgPct = validRows.reduce((a, b) => a + b.pct, 0) / taken;
    const highest = validRows.reduce((a, b) => b.total > a.total ? b : a);
    const lowest = validRows.reduce((a, b) => b.total < a.total ? b : a);
    const trend = validRows.length >= 2
      ? (validRows[validRows.length - 1].total > validRows[0].total ? "Improving"
        : validRows[validRows.length - 1].total < validRows[0].total ? "Declining" : "Stable")
      : "Stable";
    return { taken, avgPct, highest, lowest, trend };
  }, [validRows]);

  const subjectAverages = useMemo(() => {
    const sums = new Map<string, { total: number; n: number }>();
    for (const r of validRows) {
      for (const [sub, val] of Object.entries(r.subjects)) {
        if (!sums.has(sub)) sums.set(sub, { total: 0, n: 0 });
        sums.get(sub)!.total += val;
        sums.get(sub)!.n += 1;
      }
    }
    return Array.from(sums.entries()).map(([sub, { total, n }]) => ({ subject: sub, average: +(total / Math.max(n, 1)).toFixed(2) }));
  }, [validRows]);

  const improvements = useMemo(() => {
    if (validRows.length < 2) return null as null | { from: string; to: string; rows: { subject: string; delta: number }[] };
    const last = validRows[validRows.length - 1];
    const prev = validRows[validRows.length - 2];
    const subjects = new Set([...Object.keys(last.subjects), ...Object.keys(prev.subjects)]);
    return {
      from: prev.test, to: last.test,
      rows: Array.from(subjects).map(sub => ({ subject: sub, delta: (last.subjects[sub] ?? 0) - (prev.subjects[sub] ?? 0) })),
    };
  }, [validRows]);

  const insights = useMemo(() => {
    const out: string[] = [];
    if (subjectAverages.length) {
      const sorted = [...subjectAverages].sort((a, b) => b.average - a.average);
      out.push(`Strongest subject: ${sorted[0].subject} with average ${sorted[0].average} marks`);
      if (sorted.length > 1) out.push(`Needs attention: ${sorted[sorted.length - 1].subject} with average ${sorted[sorted.length - 1].average} marks`);
    }
    if (validRows.length >= 2) {
      const delta = validRows[validRows.length - 1].total - validRows[0].total;
      if (delta !== 0) out.push(`${delta > 0 ? 'Improved' : 'Dropped'} by ${Math.abs(delta)} marks from ${validRows[0].test} to ${validRows[validRows.length - 1].test}`);
    }
    return out;
  }, [subjectAverages, validRows]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!student) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Card><CardContent className="p-6">Student not found in current results data.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Button>

      <Card><CardContent className="p-5">
        <h1 className="text-xl font-bold">{get("Student Name") || get("Name")}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
          <div><div className="text-xs text-muted-foreground">User ID</div><div className="font-mono">{get("User ID")}</div></div>
          <div><div className="text-xs text-muted-foreground">Roll No</div><div>{get("Roll No")}</div></div>
          <div><div className="text-xs text-muted-foreground">Classroom</div><div>{get("Classroom Name")}</div></div>
          <div><div className="text-xs text-muted-foreground">Curriculum</div><div>{curriculum}</div></div>
          <div><div className="text-xs text-muted-foreground">Grade</div><div>{get("Grade")}</div></div>
        </div>
      </CardContent></Card>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Tests Taken</div><div className="text-2xl font-bold">{stats.taken}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Average</div><div className="text-2xl font-bold" style={{ color: CHART_COLOR }}>{stats.avgPct.toFixed(1)}%</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Highest</div><div className="text-xl font-bold text-green-600">{stats.highest.total}</div><div className="text-[10px] text-muted-foreground">{stats.highest.test}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Lowest</div><div className="text-xl font-bold text-red-600">{stats.lowest.total}</div><div className="text-[10px] text-muted-foreground">{stats.lowest.test}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Trend</div>
            <div className={`text-lg font-bold flex items-center gap-1 ${stats.trend === 'Improving' ? 'text-green-600' : stats.trend === 'Declining' ? 'text-red-600' : 'text-muted-foreground'}`}>
              {stats.trend === 'Improving' ? <TrendingUp className="h-4 w-4" /> : stats.trend === 'Declining' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {stats.trend}
            </div>
          </CardContent></Card>
        </div>
      )}

      {testRows.length > 0 && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold mb-3">Test-wise Performance</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left">Test</th>
                  {subjectAverages.map(s => <th key={s.subject} className="px-2 py-2 text-center">{s.subject}</th>)}
                  <th className="px-2 py-2 text-center">Total</th>
                  <th className="px-2 py-2 text-center">Max</th>
                  <th className="px-2 py-2 text-center">%</th>
                </tr>
              </thead>
              <tbody>
                {testRows.map(row => (
                  <tr key={row.test} className="border-t border-border">
                    <td className="px-2 py-2 font-semibold">{row.test}</td>
                    {subjectAverages.map(s => <td key={s.subject} className="px-2 py-2 text-center">{row.subjects[s.subject] ?? '—'}</td>)}
                    <td className="px-2 py-2 text-center font-bold">{row.total || '—'}</td>
                    <td className="px-2 py-2 text-center">{row.max || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      {row.pct > 0 ? <Badge variant="outline" className={row.pct >= 75 ? 'bg-green-500/10 text-green-700' : row.pct >= 50 ? 'bg-yellow-500/10 text-yellow-700' : 'bg-red-500/10 text-red-700'}>{row.pct.toFixed(1)}%</Badge> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {subjectAverages.length > 0 && (
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-3">Subject-wise Average</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={subjectAverages}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="average" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        )}
        {validRows.length > 1 && (
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-3">Test Progress</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={validRows.map(r => ({ test: r.test, total: r.total }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="test" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke={CHART_COLOR} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        )}
      </div>

      {improvements && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold mb-3">Subject Improvement: {improvements.from} → {improvements.to}</h3>
          <table className="w-full text-sm">
            <tbody>
              {improvements.rows.map(r => (
                <tr key={r.subject} className={`border-t border-border ${r.delta > 0 ? 'bg-green-500/5' : r.delta < 0 ? 'bg-red-500/5' : 'bg-yellow-500/5'}`}>
                  <td className="px-2 py-2">{r.subject}</td>
                  <td className="px-2 py-2 text-right font-bold" style={{ color: r.delta > 0 ? 'hsl(148 63% 30%)' : r.delta < 0 ? 'hsl(0 70% 45%)' : 'hsl(45 90% 35%)' }}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {insights.length > 0 && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Target className="h-4 w-4" /> Insights</h3>
          <ul className="space-y-2 text-sm">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2">
                {i === 0 ? <Trophy className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /> : i === 1 ? <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" /> : <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />}
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </div>
  );
}

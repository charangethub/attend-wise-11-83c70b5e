import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { useResultsData } from "@/hooks/useResultsData";
import { usePageDataset } from "@/hooks/usePageDataset";

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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!student) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Card><CardContent className="p-6">Student not found in current results data.</CardContent></Card>
      </div>
    );
  }

  const get = (k: string) => student.info[k] ?? Object.entries(student.info).find(([key]) => key.toLowerCase() === k.toLowerCase())?.[1] ?? "";

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back to Results</Button>
      <Card><CardContent className="p-5">
        <h1 className="text-xl font-bold">{get("Student Name") || get("Name")}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
          <div><div className="text-xs text-muted-foreground">User ID</div><div className="font-mono">{get("User ID")}</div></div>
          <div><div className="text-xs text-muted-foreground">Roll No</div><div>{get("Roll No")}</div></div>
          <div><div className="text-xs text-muted-foreground">Classroom</div><div>{get("Classroom Name")}</div></div>
          <div><div className="text-xs text-muted-foreground">Curriculum</div><div>{get("Curriculium") || get("Curriculum")}</div></div>
          <div><div className="text-xs text-muted-foreground">Grade</div><div>{get("Grade")}</div></div>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(student.results).map(([testName, subjects]) => {
          const hasData = Object.values(subjects).some(v => String(v ?? "").trim());
          if (!hasData) return null;
          return (
            <Card key={testName}><CardContent className="p-4">
              <h3 className="font-semibold mb-2">{testName}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(subjects).map(([k, v]) => (
                    <tr key={k} className="border-t border-border">
                      <td className="py-1 text-muted-foreground">{k}</td>
                      <td className="py-1 text-right font-semibold">{v || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          );
        })}
      </div>
    </div>
  );
}
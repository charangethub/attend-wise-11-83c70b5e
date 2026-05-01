import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePageDataset } from "./usePageDataset";
import { useEffect } from "react";

export type ExamType = 'quarterly' | 'half_yearly' | 'pre_final_1' | 'pre_final_2';

export const SUBJECTS_JEE = ['Sanskrit', 'English', 'Maths A', 'Maths B', 'Physics', 'Chemistry'];
export const SUBJECTS_NEET = ['Sanskrit', 'English', 'Botany', 'Zoology', 'Physics', 'Chemistry'];

export function getSubjectsForCurriculum(curriculum: string): string[] {
  return (curriculum || '').toUpperCase().includes('NEET') ? SUBJECTS_NEET : SUBJECTS_JEE;
}

export const EXAM_PAGE_NAME: Record<ExamType, string> = {
  quarterly: 'Quarterly Marks',
  half_yearly: 'Half Yearly Marks',
  pre_final_1: 'Pre-Final 1 Marks',
  pre_final_2: 'Pre-Final 2 Marks',
};

export interface StudentRow {
  userId: string;
  rollNumber: string;
  studentName: string;
  classroom: string;
  curriculum: string;
  grade: string;
  enrollmentStatus: string;
}

export interface ExamMark {
  id: string;
  exam_type: ExamType;
  student_user_id: string;
  subject: string;
  max_marks: number;
  obtained_marks: number;
}

function rowToStudent(s: any): StudentRow {
  return {
    userId: s.user_id_vedantu ?? '',
    rollNumber: s.roll_no ?? '',
    studentName: s.student_name ?? '',
    classroom: s.classroom_name ?? '',
    curriculum: s.curriculum ?? '',
    grade: s.grade ?? '',
    enrollmentStatus: s.enrollment_status ?? '',
  };
}

// Simple CSV parser (handles quoted fields)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { cur.push(f); f = ''; }
      else if (c === '\n') { cur.push(f); rows.push(cur); cur = []; f = ''; }
      else if (c === '\r') {/*skip*/}
      else f += c;
    }
  }
  if (f.length || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}

function normSheetCsvUrl(url: string): string | null {
  if (!url) return null;
  if (url.includes('output=csv')) return url;
  const eMatch = url.match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)/);
  if (eMatch) {
    const gidMatch = url.match(/[?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `${eMatch[1]}/pub?gid=${gid}&single=true&output=csv`;
  }
  const dMatch = url.match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+)/);
  if (dMatch) {
    const gidMatch = url.match(/[?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `${dMatch[1]}/export?format=csv&gid=${gid}`;
  }
  return url;
}

async function fetchStudentsFromSheet(sheetUrl: string): Promise<StudentRow[]> {
  const csvUrl = normSheetCsvUrl(sheetUrl);
  if (!csvUrl) return [];
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) return [];
    const text = await res.text();
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = headers.findIndex(h => h === n.toLowerCase());
        if (i >= 0) return i;
      }
      // fuzzy contains
      for (const n of names) {
        const i = headers.findIndex(h => h.includes(n.toLowerCase()));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iUser = idx('user id', 'user_id', 'user_id_vedantu', 'userid');
    const iRoll = idx('roll no', 'roll_no', 'roll number', 'rollno');
    const iName = idx('student name', 'student_name', 'name');
    const iClass = idx('classroom name', 'classroom_name', 'classroom');
    const iCurr = idx('curriculum', 'curriculium');
    const iGrade = idx('grade');
    const iEnroll = idx('enrollment status', 'enrollment_status', 'status');
    const out: StudentRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const userId = (iUser >= 0 ? row[iUser] : '')?.trim() ?? '';
      const name = (iName >= 0 ? row[iName] : '')?.trim() ?? '';
      if (!userId && !name) continue;
      out.push({
        userId,
        rollNumber: (iRoll >= 0 ? row[iRoll] : '')?.trim() ?? '',
        studentName: name,
        classroom: (iClass >= 0 ? row[iClass] : '')?.trim() ?? '',
        curriculum: (iCurr >= 0 ? row[iCurr] : '')?.trim() ?? '',
        grade: (iGrade >= 0 ? row[iGrade] : '')?.trim() ?? '',
        enrollmentStatus: (iEnroll >= 0 ? row[iEnroll] : '')?.trim() ?? 'ENROLLED',
      });
    }
    return out;
  } catch { return []; }
}

export function useExamMarks(examType: ExamType) {
  const queryClient = useQueryClient();
  const pageName = EXAM_PAGE_NAME[examType];
  const { datasetSlug, datasetName, loading: dsLoading } = usePageDataset(pageName);

  const studentsQuery = useQuery<StudentRow[]>({
    queryKey: ["exam-students", datasetSlug],
    enabled: !dsLoading,
    queryFn: async () => {
      // 1) Try Supabase students table
      let q = supabase.from('students').select('*').eq('enrollment_status', 'ENROLLED');
      if (datasetSlug) q = q.eq('dataset', datasetSlug);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (rows.length > 0) return rows.map(rowToStudent);

      // 2) Fallback: fetch the dataset's sheet_url CSV directly
      let sheetUrl = '';
      if (datasetSlug) {
        const { data: ds } = await supabase.from('student_datasets').select('sheet_url').eq('slug', datasetSlug).maybeSingle();
        sheetUrl = (ds as any)?.sheet_url ?? '';
      }
      if (!sheetUrl) {
        const { data: ds } = await supabase.from('student_datasets').select('sheet_url').eq('is_active', true).limit(1).maybeSingle();
        sheetUrl = (ds as any)?.sheet_url ?? '';
      }
      if (!sheetUrl) return [];
      return await fetchStudentsFromSheet(sheetUrl);
    },
    staleTime: 5 * 60 * 1000,
  });

  const marksQuery = useQuery<ExamMark[]>({
    queryKey: ["exam-marks", examType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_marks')
        .select('id, exam_type, student_user_id, subject, max_marks, obtained_marks')
        .eq('exam_type', examType);
      if (error) throw error;
      return (data ?? []) as ExamMark[];
    },
    staleTime: 30 * 1000,
  });

  // Realtime invalidation
  useEffect(() => {
    const channelName = `exam-marks-${examType}-${Date.now()}`;
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_marks', filter: `exam_type=eq.${examType}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['exam-marks', examType] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [examType, queryClient]);

  const upsertMark = useMutation({
    mutationFn: async (input: {
      student: StudentRow;
      marks: Record<string, { max: number; obtained: number }>;
    }) => {
      const { student, marks } = input;
      const { data: { user } } = await supabase.auth.getUser();
      const rows = Object.entries(marks).map(([subject, vals]) => ({
        exam_type: examType,
        student_user_id: student.userId,
        student_name: student.studentName,
        roll_number: student.rollNumber,
        classroom: student.classroom,
        curriculum: student.curriculum,
        grade: student.grade,
        enrollment_status: student.enrollmentStatus,
        subject,
        max_marks: Number(vals.max) || 0,
        obtained_marks: Number(vals.obtained) || 0,
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase
        .from('exam_marks')
        .upsert(rows, { onConflict: 'exam_type,student_user_id,subject' });
      if (error) throw error;

      // Fire-and-forget sync
      supabase.functions.invoke('sync-marks-to-sheet', {
        body: {
          exam_type: examType,
          student_user_id: student.userId,
          student_name: student.studentName,
          roll_number: student.rollNumber,
          classroom: student.classroom,
          curriculum: student.curriculum,
          grade: student.grade,
          enrollment_status: student.enrollmentStatus,
          marks,
        },
      }).catch(err => console.warn('sync-marks-to-sheet failed:', err));

      return rows;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-marks', examType] });
    },
  });

  return {
    students: studentsQuery.data ?? [],
    marks: marksQuery.data ?? [],
    isLoading: dsLoading || studentsQuery.isLoading || marksQuery.isLoading,
    error: studentsQuery.error || marksQuery.error,
    datasetName,
    datasetSlug,
    upsertMark,
    refetch: () => {
      studentsQuery.refetch();
      marksQuery.refetch();
    },
  };
}
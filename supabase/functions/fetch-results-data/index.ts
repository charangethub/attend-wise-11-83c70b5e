import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

function normalizeBaseUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)/);
  if (m) return m[1];
  const m2 = url.match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+)/);
  return m2 ? m2[1] : null;
}

async function fetchCsv(baseUrl: string, gid: string): Promise<string | null> {
  const isPubE = baseUrl.includes('/d/e/');
  const url = isPubE
    ? `${baseUrl}/pub?gid=${gid}&single=true&output=csv`
    : `${baseUrl}/export?format=csv&gid=${gid}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return null;
    return text;
  } catch { return null; }
}

const TEST_GROUP_RE = /(?:rt|ut)[\s\-–—]*\d+|test\s*\d+/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const datasetSlug: string | undefined = body?.dataset_slug;

    // Resolve sheet URL: prefer explicit dataset slug, else page mapping for "Results Dashboard", else active dataset
    let sheetUrl: string | null = null;
    if (datasetSlug) {
      const { data } = await supabase.from('student_datasets').select('sheet_url').eq('slug', datasetSlug).maybeSingle();
      sheetUrl = (data as any)?.sheet_url ?? null;
    }
    if (!sheetUrl) {
      const { data: mapping } = await supabase.from('page_dataset_mapping').select('dataset_slug').eq('page_name', 'Results Dashboard').maybeSingle();
      const slug = (mapping as any)?.dataset_slug;
      if (slug) {
        const { data } = await supabase.from('student_datasets').select('sheet_url').eq('slug', slug).maybeSingle();
        sheetUrl = (data as any)?.sheet_url ?? null;
      }
    }
    if (!sheetUrl) {
      const { data } = await supabase.from('student_datasets').select('sheet_url').eq('is_active', true).limit(1).maybeSingle();
      sheetUrl = (data as any)?.sheet_url ?? null;
    }
    if (!sheetUrl) {
      return new Response(JSON.stringify({ error: 'No dataset sheet URL configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const baseUrl = normalizeBaseUrl(sheetUrl);
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: 'Could not parse Google Sheet URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine GIDs to try
    const { data: gidSetting } = await supabase.from('system_settings').select('value').eq('key', 'results_sheet_gid').maybeSingle();
    const configuredGid = (gidSetting as any)?.value?.trim();
    const gidCandidates = Array.from(new Set([configuredGid, '1074701588', '0', '1', '2'].filter(Boolean))) as string[];

    let csv: string | null = null;
    let gidUsed = '';
    for (const gid of gidCandidates) {
      csv = await fetchCsv(baseUrl, gid);
      if (csv) { gidUsed = gid; break; }
    }
    if (!csv) {
      return new Response(JSON.stringify({
        students: [], studentInfoColumns: [], testGroups: [], testNames: [], totalStudents: 0,
        gidUsed: '', error: 'Could not fetch results sheet for any GID',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rows = parseCsv(csv);
    if (rows.length < 3) {
      return new Response(JSON.stringify({
        students: [], studentInfoColumns: [], testGroups: [], testNames: [], totalStudents: 0,
        gidUsed, fetchedAt: new Date().toISOString(),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const row0 = rows[0];
    const row1 = rows[1];
    const row2 = rows[2] ?? [];
    const ncols = Math.max(row0.length, row1.length, row2.length);

    // Expand row 0 (test group headers) forward
    const groupNames: string[] = [];
    let lastGroup = '';
    for (let i = 0; i < ncols; i++) {
      const v = (row0[i] ?? '').trim();
      if (v) lastGroup = v;
      groupNames.push(lastGroup);
    }

    // Identify info vs test columns based on row 0 group name pattern
    const studentInfoColumns: string[] = [];
    const testGroups: { name: string; columns: { index: number; subHeader: string; maxMark: number }[] }[] = [];
    const groupMap = new Map<string, { name: string; columns: { index: number; subHeader: string; maxMark: number }[] }>();

    // Detect if row2 is a max-marks row (mostly numeric across test columns) — falls back to data row otherwise
    let maxMarksRowIsHeader = false;
    {
      let numericCount = 0, totalTestCols = 0;
      for (let i = 0; i < ncols; i++) {
        const grp = (() => { let last = ''; for (let j = 0; j <= i; j++) { const v = (row0[j] ?? '').trim(); if (v) last = v; } return last; })();
        if (grp && TEST_GROUP_RE.test(grp)) {
          totalTestCols++;
          const v = (row2[i] ?? '').trim();
          if (v && !isNaN(Number(v))) numericCount++;
        }
      }
      maxMarksRowIsHeader = totalTestCols > 0 && numericCount / totalTestCols >= 0.5;
    }

    for (let i = 0; i < ncols; i++) {
      const sub = (row1[i] ?? '').trim();
      const grp = groupNames[i];
      const isTestGroup = grp && TEST_GROUP_RE.test(grp);
      if (isTestGroup) {
        if (!groupMap.has(grp)) {
          const g = { name: grp, columns: [] as { index: number; subHeader: string; maxMark: number }[] };
          groupMap.set(grp, g);
          testGroups.push(g);
        }
        const maxMark = maxMarksRowIsHeader ? Number((row2[i] ?? '').trim()) || 0 : 0;
        groupMap.get(grp)!.columns.push({ index: i, subHeader: sub, maxMark });
      } else {
        if (sub) studentInfoColumns.push(sub);
      }
    }

    // Build students
    const infoIdxByName: { name: string; index: number }[] = [];
    for (let i = 0; i < ncols; i++) {
      const sub = (row1[i] ?? '').trim();
      const grp = groupNames[i];
      const isTestGroup = grp && TEST_GROUP_RE.test(grp);
      if (!isTestGroup && sub) infoIdxByName.push({ name: sub, index: i });
    }

    const students = [];
    const dataStart = maxMarksRowIsHeader ? 3 : 2;
    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => !String(c ?? '').trim())) continue;
      const info: Record<string, string> = {};
      for (const { name, index } of infoIdxByName) info[name] = (row[index] ?? '').trim();
      const results: Record<string, Record<string, string>> = {};
      for (const g of testGroups) {
        const obj: Record<string, string> = {};
        for (const col of g.columns) obj[col.subHeader || `col_${col.index}`] = (row[col.index] ?? '').trim();
        results[g.name] = obj;
      }
      const hasAnyInfo = Object.values(info).some(v => v);
      if (!hasAnyInfo) continue;
      students.push({ info, results });
    }

    return new Response(JSON.stringify({
      studentInfoColumns,
      testGroups: testGroups.map(g => ({
        name: g.name,
        subHeaders: g.columns.map(c => c.subHeader),
        maxMarks: g.columns.map(c => c.maxMark),
      })),
      testNames: testGroups.map(g => g.name),
      students,
      totalStudents: students.length,
      gidUsed,
      maxMarksRowDetected: maxMarksRowIsHeader,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[fetch-results-data]', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
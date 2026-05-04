import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = ''; let inQuotes = false; const fields: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        fields.push(current.trim()); current = '';
        if (fields.some(f => f !== '')) rows.push([...fields]);
        fields.length = 0;
      } else { current += ch; }
    }
  }
  fields.push(current.trim());
  if (fields.some(f => f !== '')) rows.push([...fields]);
  return rows;
}

function normalizeCsvUrl(url: string): string {
  if (url.includes('/pubhtml')) { url = url.replace('/pubhtml', '/pub'); if (!url.includes('output=csv')) url += (url.includes('?') ? '&' : '?') + 'output=csv'; }
  else if (!url.includes('output=csv')) { url += (url.includes('?') ? '&' : '?') + 'output=csv'; }
  return url;
}

function findColumnIndex(headers: string[], matchers: string[]): number {
  for (const matcher of matchers) { const idx = headers.findIndex(h => h.includes(matcher)); if (idx >= 0) return idx; }
  return -1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).maybeSingle();
    if (!roleRow || !['owner', 'admin'].includes(roleRow.role)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let requestedSlug: string | null = null;
    try { const body = await req.json(); if (body?.dataset_slug) requestedSlug = String(body.dataset_slug); } catch { /* no body */ }

    let datasetQuery = supabase.from('student_datasets').select('*');
    datasetQuery = requestedSlug ? datasetQuery.eq('slug', requestedSlug) : datasetQuery.eq('is_active', true);
    const { data: datasetRows, error: datasetErr } = await datasetQuery.limit(1).single();
    if (datasetErr || !datasetRows) return new Response(JSON.stringify({ success: false, error: requestedSlug ? `Dataset "${requestedSlug}" not found.` : 'No active dataset found.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const dataset = datasetRows as any;
    const slug = dataset.slug as string;
    const name = dataset.name as string;
    if (!dataset.sheet_url) return new Response(JSON.stringify({ success: false, error: `No CSV URL for "${name}".` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const csvUrl = normalizeCsvUrl(dataset.sheet_url);
    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) return new Response(JSON.stringify({ success: false, error: `Failed to fetch: HTTP ${csvResponse.status}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const csvText = await csvResponse.text();
    if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) return new Response(JSON.stringify({ success: false, error: 'URL returned HTML instead of CSV.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const rows = parseCSV(csvText);
    if (rows.length < 2) return new Response(JSON.stringify({ success: false, error: `Sheet empty — ${rows.length} row(s).` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const headers = rows[0].map(h => h.toLowerCase().replace(/[.\s\n\r\(\)\/\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    const rollNoIdx = findColumnIndex(headers, ['roll_no', 'roll_number', 'rollno', 'roll', 's_no', 'sno', 'sr_no', 'id']);
    const studentNameIdx = findColumnIndex(headers, ['student_name', 'full_name', 'name', 'sname', 'candidate_name', 'student']);
    if (rollNoIdx === -1 || studentNameIdx === -1) return new Response(JSON.stringify({ success: false, error: `Required columns not found. Found: [${headers.join(', ')}]`, found_columns: headers }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const centerIdx = findColumnIndex(headers, ['center', 'centre', 'branch']);
    const zoneIdx = findColumnIndex(headers, ['zone', 'region']);
    const userIdVedantuIdx = findColumnIndex(headers, ['user_id', 'userid', 'vedantu_id']);
    const orderIdIdx = findColumnIndex(headers, ['order_id', 'orderid']);
    const curriculumIdx = findColumnIndex(headers, ['curriculium', 'curriculum', 'course']);
    const gradeIdx = findColumnIndex(headers, ['grade', 'class', 'std']);
    const batchTypeIdx = findColumnIndex(headers, ['batch_type', 'batch', 'type']);
    const classroomNameIdx = findColumnIndex(headers, ['classroom_name', 'classroom', 'room', 'section']);
    const classroomIdIdx = findColumnIndex(headers, ['classroom_id', 'room_id']);
    const enrollmentDateIdx = findColumnIndex(headers, ['enrollment_date', 'enroll_date', 'join_date']);
    const enrollmentStatusIdx = findColumnIndex(headers, ['enrollment_status', 'enroll_status', 'status']);
    const ec1Idx = findColumnIndex(headers, ['emergency_contact_number_1', 'emergency_contact_1', 'contact_1', 'parent_contact', 'contact', 'phone', 'mobile', 'registered_contact']);
    const ec2Idx = findColumnIndex(headers, ['emergency_contact_number_2', 'emergency_contact_2', 'contact_2', 'mother_contact', 'alternate_contact']);
    const mobileIdx = findColumnIndex(headers, ['registered_contact_number', 'registered_contact', 'contact_number', 'mobile_number']);

    const students: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const rollNo = (cols[rollNoIdx] || '').trim();
      const name_s = (cols[studentNameIdx] || '').trim();
      const userIdRaw = userIdVedantuIdx >= 0 ? (cols[userIdVedantuIdx] || '').trim() : '';
      // A row is valid if it has a name AND at least one identifier (roll_no OR user_id_vedantu).
      // Roll number may legitimately be empty for newly-enrolled students; user_id_vedantu is the
      // primary identifier in that case.
      if (!name_s) continue;
      const sanitizedRollNo = rollNo.replace(/[^a-zA-Z0-9\-_]/g, '');
      if (!sanitizedRollNo && !userIdRaw) continue;
      students.push({
        roll_no: sanitizedRollNo, student_name: name_s, dataset: slug,
        zone: zoneIdx >= 0 ? (cols[zoneIdx] || '').trim() : '',
        center: centerIdx >= 0 ? (cols[centerIdx] || '').trim() : '',
        user_id_vedantu: userIdRaw,
        order_id: orderIdIdx >= 0 ? (cols[orderIdIdx] || '').trim() : '',
        curriculum: curriculumIdx >= 0 ? (cols[curriculumIdx] || '').trim() : '',
        grade: gradeIdx >= 0 ? (cols[gradeIdx] || '').trim() : '',
        batch_type: batchTypeIdx >= 0 ? (cols[batchTypeIdx] || '').trim() : '',
        classroom_name: classroomNameIdx >= 0 ? (cols[classroomNameIdx] || '').trim() : '',
        classroom_id: classroomIdIdx >= 0 ? (cols[classroomIdIdx] || '').trim() : '',
        enrollment_date: enrollmentDateIdx >= 0 ? (cols[enrollmentDateIdx] || '').trim() : '',
        enrollment_status: enrollmentStatusIdx >= 0 ? (cols[enrollmentStatusIdx] || '').trim() : '',
        emergency_contact_1: ec1Idx >= 0 ? (cols[ec1Idx] || '').trim() : '',
        emergency_contact_2: ec2Idx >= 0 ? (cols[ec2Idx] || '').trim() : '',
        mobile_number: mobileIdx >= 0 ? (cols[mobileIdx] || '').trim() : '',
      });
    }

    if (students.length === 0) return new Response(JSON.stringify({ success: false, error: `No students parsed from ${rows.length - 1} rows.`, found_columns: headers }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Build sets of identifiers present in the sheet so we can prune students that no longer exist.
    // Match by user_id_vedantu first (primary identifier), then fall back to roll_no.
    const sheetUserIds = new Set(students.map(s => s.user_id_vedantu).filter((v: string) => v && v.length > 0));
    const sheetRollNos = new Set(students.map(s => s.roll_no).filter((v: string) => v && v.length > 0));

    const { data: existingStudents } = await supabase
      .from('students')
      .select('id, roll_no, user_id_vedantu')
      .eq('dataset', slug);

    const toDelete = (existingStudents ?? []).filter((s: any) => {
      const uid = (s.user_id_vedantu || '').trim();
      const roll = (s.roll_no || '').trim();
      if (uid && sheetUserIds.has(uid)) return false;
      if (roll && sheetRollNos.has(roll)) return false;
      return true;
    }).map((s: any) => s.id);
    if (toDelete.length > 0) { for (let i = 0; i < toDelete.length; i += 100) { await supabase.from('students').delete().in('id', toDelete.slice(i, i + 100)); } }

    // Build lookup maps of remaining existing rows by user_id_vedantu and roll_no for fast match.
    const remaining = (existingStudents ?? []).filter((s: any) => !toDelete.includes(s.id));
    const byUserId = new Map<string, string>();
    const byRollNo = new Map<string, string>();
    for (const s of remaining as any[]) {
      const uid = (s.user_id_vedantu || '').trim();
      const roll = (s.roll_no || '').trim();
      if (uid) byUserId.set(uid, s.id);
      if (roll) byRollNo.set(roll, s.id);
    }

    let synced = 0;
    const upsertErrors: string[] = [];
    for (const student of students) {
      const uid = (student.user_id_vedantu || '').trim();
      const roll = (student.roll_no || '').trim();
      // Prefer matching by user_id_vedantu (stable identifier from the source).
      const existingId = (uid && byUserId.get(uid)) || (roll && byRollNo.get(roll)) || null;

      let error: any = null;
      if (existingId) {
        ({ error } = await supabase.from('students').update(student).eq('id', existingId));
      } else {
        ({ error } = await supabase.from('students').insert(student));
      }
      if (!error) {
        synced++;
        // Track newly inserted rows so subsequent rows in the same sheet don't re-insert.
        if (!existingId) {
          if (uid) byUserId.set(uid, 'new');
          if (roll) byRollNo.set(roll, 'new');
        }
      } else if (upsertErrors.length < 3) {
        upsertErrors.push(error.message);
      }
    }

    if (synced === 0 && upsertErrors.length > 0) return new Response(JSON.stringify({ success: false, error: `All upserts failed: ${upsertErrors[0]}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    await supabase.from('student_datasets').update({ updated_at: new Date().toISOString() }).eq('slug', slug);
    await supabase.from('system_settings').upsert({ key: 'last_sync_at', value: new Date().toISOString() }, { onConflict: 'key' });

    return new Response(JSON.stringify({ success: true, synced, total: students.length, dataset_slug: slug, dataset_name: name, warning: upsertErrors.length > 0 ? `${upsertErrors.length} failed: ${upsertErrors[0]}` : undefined }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[sync-google-sheet] internal error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

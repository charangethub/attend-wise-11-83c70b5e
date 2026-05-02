import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXAM_LABEL: Record<string, string> = {
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  pre_final_1: 'Pre Final 1',
  pre_final_2: 'Pre Final 2',
};

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
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['owner', 'admin'].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const exam_type = body?.exam_type as string;
    if (!exam_type || !EXAM_LABEL[exam_type]) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or missing exam_type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get all marks for this exam type
    const { data: marks } = await admin
      .from('exam_marks')
      .select('*')
      .eq('exam_type', exam_type);

    if (!marks || marks.length === 0) {
      return new Response(JSON.stringify({ success: true, pushed: 0, message: 'No marks recorded for this exam' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Group by student
    const byStudent = new Map<string, any>();
    for (const m of marks) {
      if (!byStudent.has(m.student_user_id)) {
        byStudent.set(m.student_user_id, {
          student_user_id: m.student_user_id,
          student_name: m.student_name ?? '',
          roll_number: m.roll_number ?? '',
          classroom: m.classroom ?? '',
          curriculum: m.curriculum ?? '',
          grade: m.grade ?? '',
          enrollment_status: m.enrollment_status ?? '',
          subjects: {} as Record<string, { max: number; obtained: number }>,
        });
      }
      byStudent.get(m.student_user_id).subjects[m.subject] = {
        max: Number(m.max_marks) || 0,
        obtained: Number(m.obtained_marks) || 0,
      };
    }
    const studentRows = Array.from(byStudent.values()).map(s => {
      let totalMax = 0, totalObt = 0;
      for (const v of Object.values(s.subjects) as any[]) { totalMax += v.max; totalObt += v.obtained; }
      const percentage = totalMax > 0 ? Math.round((totalObt / totalMax) * 1000) / 10 : 0;
      return { ...s, total_max: totalMax, total_obtained: totalObt, percentage };
    });

    // Get marks sync targets
    const { data: targets } = await admin
      .from('sync_targets')
      .select('apps_script_url, label')
      .eq('purpose', 'marks')
      .eq('is_active', true);

    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active marks sync targets configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = {
      action: 'sync_exam_marks_bulk',
      exam_type,
      exam_label: EXAM_LABEL[exam_type],
      students: studentRows,
      synced_at: new Date().toISOString(),
    };

    const failures: string[] = [];
    let pushed = 0;
    await Promise.all(targets.map(async (t: any) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        const res = await fetch(t.apps_script_url.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await res.text();
        const trimmed = text.trim();
        if (!res.ok || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
          failures.push(`${t.label}: ${!res.ok ? `HTTP ${res.status}` : 'returned HTML (check deployment)'}`);
        } else {
          pushed += studentRows.length;
        }
      } catch (e: any) {
        failures.push(`${t.label}: ${e?.message ?? String(e)}`);
      }
    }));

    return new Response(JSON.stringify({
      success: failures.length < targets.length,
      pushed: studentRows.length,
      targets: targets.length,
      failures,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[push-marks-to-sheet]', e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
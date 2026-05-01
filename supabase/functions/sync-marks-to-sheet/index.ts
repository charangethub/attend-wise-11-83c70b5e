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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    const { data: statusRow } = await supabaseAdmin.from('user_status').select('status').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['owner', 'admin', 'teacher'].includes(roleRow.role) || statusRow?.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const {
      exam_type, student_user_id, student_name = '', roll_number = '',
      classroom = '', curriculum = '', grade = '', enrollment_status = '',
      marks = {},
    } = body as {
      exam_type: string; student_user_id: string; student_name?: string; roll_number?: string;
      classroom?: string; curriculum?: string; grade?: string; enrollment_status?: string;
      marks?: Record<string, { max: number; obtained: number }>;
    };

    if (!exam_type || !EXAM_LABEL[exam_type]) {
      return new Response(JSON.stringify({ error: 'Invalid or missing exam_type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!student_user_id) {
      return new Response(JSON.stringify({ error: 'student_user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get marks sync targets
    const { data: targets } = await supabaseAdmin
      .from('sync_targets')
      .select('apps_script_url, label')
      .eq('purpose', 'marks')
      .eq('is_active', true);

    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'No marks Apps Script URL configured. Add one in Admin → Datasets → Sync Targets with purpose "Marks".',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let totalMax = 0, totalObtained = 0;
    const subjectsRow: Record<string, { max: number; obtained: number }> = {};
    for (const [subject, vals] of Object.entries(marks)) {
      const max = Number(vals?.max ?? 0) || 0;
      const obt = Number(vals?.obtained ?? 0) || 0;
      subjectsRow[subject] = { max, obtained: obt };
      totalMax += max;
      totalObtained += obt;
    }
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;

    const payload = {
      action: 'sync_exam_marks',
      exam_type,
      exam_label: EXAM_LABEL[exam_type],
      student_user_id,
      student_name,
      roll_number,
      classroom,
      curriculum,
      grade,
      enrollment_status,
      marks: subjectsRow,
      total_max: totalMax,
      total_obtained: totalObtained,
      percentage,
      synced_at: new Date().toISOString(),
    };

    const results = await Promise.all(targets.map(async (t: any) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
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
        if (!res.ok) return { label: t.label, success: false, error: `HTTP ${res.status}` };
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
          return { label: t.label, success: false, error: 'Apps Script returned HTML — check deployment access permissions.' };
        }
        return { label: t.label, success: true };
      } catch (e: any) {
        return { label: t.label, success: false, error: e?.message ?? String(e) };
      }
    }));

    const anySuccess = results.some(r => r.success);
    return new Response(JSON.stringify({
      status: anySuccess ? 'synced' : 'failed',
      exam_type,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[sync-marks-to-sheet]', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
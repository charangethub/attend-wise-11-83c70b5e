import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer '))
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    const { data: statusRow } = await supabaseAdmin.from('user_status').select('status').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['owner', 'admin', 'teacher'].includes(roleRow.role) || statusRow?.status !== 'active')
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const { date, only } = body as { date?: string; only?: string[] };
    if (!date)
      return new Response(JSON.stringify({ error: 'date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get active dataset
    const { data: activeDataset } = await supabase
      .from('student_datasets')
      .select('slug, name')
      .eq('is_active', true)
      .limit(1)
      .single();
    const activeSlug = activeDataset?.slug ?? null;

    // Filter students by active dataset
    let studentsQuery = supabase.from('students').select('*').eq('enrollment_status', 'ENROLLED').neq('roll_no', '');
    if (activeSlug) studentsQuery = studentsQuery.eq('dataset', activeSlug);
    const { data: studentsData } = await studentsQuery;

    // Fetch attendance
    const { data: attData } = await supabase
      .from('attendance')
      .select('*, students(roll_no, student_name, classroom_name, curriculum, grade, center, mobile_number, emergency_contact_1, emergency_contact_2, user_id_vedantu)')
      .eq('date', date);

    const activeStudentIds = new Set((studentsData ?? []).map((s: any) => s.id));
    const filteredAttData = (attData ?? []).filter((a: any) => activeStudentIds.has(a.student_id));

    const absentees = filteredAttData.filter((a: any) => a.status === 'A' || a.status === 'L');
    const presentCount = filteredAttData.filter((a: any) => a.status === 'P').length;
    const totalStudents = (studentsData ?? []).length;

    // Fetch all active sync targets
    const { data: targets } = await supabase
      .from('sync_targets')
      .select('*')
      .eq('is_active', true);

    // Legacy fallback
    const { data: legacySetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'google_apps_script_url')
      .single();

    const allTargets: { id: string; label: string; apps_script_url: string }[] = [...(targets ?? [])];
    if (legacySetting?.value && allTargets.length === 0) {
      allTargets.push({ id: 'legacy', label: 'Legacy URL', apps_script_url: legacySetting.value });
    }

    if (allTargets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No sync targets configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allActions = [
      { action: 'sync_master', students: studentsData ?? [] },
      { action: 'sync_attendance', date, records: filteredAttData },
      { action: 'sync_absentees', date, absentees },
      {
        action: 'sync_analytics', date,
        total_students: totalStudents, total: totalStudents,
        present_count: presentCount, present: presentCount,
        absent_count: absentees.length, absent: absentees.length,
      },
    ];
    // If `only` is provided, restrict to those actions for fast partial syncs.
    const actions = Array.isArray(only) && only.length > 0
      ? allActions.filter(a => only.includes(a.action))
      : allActions.filter(a => a.action !== 'sync_master'); // default: skip heavy master push

    // Push to ALL active sync targets
    const targetResults = await Promise.all(
      allTargets.map(async (target) => {
        // Run actions SEQUENTIALLY per target — Apps Script serializes requests per deployment,
        // so parallel POSTs just queue up and time out. Sequential is actually faster.
        const perActionResults: { action: string; success: boolean; error?: string }[] = [];
        for (const payload of actions) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            const res = await fetch(target.apps_script_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              redirect: 'follow',
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const text = await res.text();
            const trimmed = text.trim();
            const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');
            if (!res.ok) {
              const hint = isHtml && trimmed.includes('Page Not Found')
                ? 'Apps Script URL invalid or not deployed (Page Not Found). Re-deploy as Web app, set Execute as: Me, Who has access: Anyone, then paste the new /exec URL.'
                : isHtml ? 'Got HTML response (likely login/permission page). Re-deploy Apps Script with access "Anyone".'
                : `HTTP ${res.status}`;
              perActionResults.push({ action: payload.action, success: false, error: hint });
            } else if (isHtml) {
              perActionResults.push({ action: payload.action, success: false, error: 'Apps Script returned HTML instead of JSON. Check deployment access permissions.' });
            } else {
              try {
                const json = JSON.parse(text);
                perActionResults.push({ action: payload.action, success: json.success !== false, error: json.error });
              } catch {
                perActionResults.push({ action: payload.action, success: true });
              }
            }
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            perActionResults.push({ action: payload.action, success: false, error: msg.includes('abort') ? 'Timeout (45s) — Apps Script took too long' : msg });
          }
        }
        const failures = perActionResults.filter(r => !r.success);
        return {
          label: target.label,
          success: failures.length === 0,
          synced: perActionResults.length - failures.length,
          total_actions: perActionResults.length,
          ...(failures.length > 0 ? { errors: failures.map(f => `${f.action}: ${f.error}`) } : {}),
        };
      })
    );

    const anySuccess = targetResults.some(r => r.success);

    if (anySuccess) {
      await supabase.from('system_settings').upsert(
        { key: 'last_sync_at', value: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }

    return new Response(
      JSON.stringify({
        success: anySuccess,
        dataset: activeSlug,
        total_students: totalStudents,
        attendance_records: filteredAttData.length,
        results: targetResults,
        ...(targetResults.some(r => !r.success) ? { errors: targetResults.filter(r => !r.success).flatMap(r => (r as any).errors ?? [`${r.label}: Failed`]) } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-to-sheet] internal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

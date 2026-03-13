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
    const { date } = body;
    if (!date)
      return new Response(JSON.stringify({ error: 'date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get Apps Script URL from system settings
    const { data: scriptSetting } = await supabase.from('system_settings').select('value').eq('key', 'google_apps_script_url').single();
    const scriptUrl = scriptSetting?.value;
    if (!scriptUrl)
      return new Response(JSON.stringify({ success: false, error: 'Apps Script URL not configured in System Settings' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ✅ FIX 2: Get active dataset to filter students correctly
    const { data: activeDataset } = await supabase
      .from('student_datasets')
      .select('slug, name')
      .eq('is_active', true)
      .limit(1)
      .single();
    const activeSlug = activeDataset?.slug ?? null;

    // ✅ FIX 2: Filter students by active dataset only (not all datasets)
    let studentsQuery = supabase.from('students').select('*').eq('enrollment_status', 'ENROLLED').neq('roll_no', '');
    if (activeSlug) studentsQuery = studentsQuery.eq('dataset', activeSlug);
    const { data: studentsData } = await studentsQuery;

    // ✅ FIX 3: Include mobile_number in the attendance join
    const { data: attData } = await supabase
      .from('attendance')
      .select('*, students(roll_no, student_name, classroom_name, curriculum, grade, center, mobile_number, emergency_contact_1, emergency_contact_2)')
      .eq('date', date);

    // Filter attendance to active dataset students only
    const activeStudentIds = new Set((studentsData ?? []).map((s: any) => s.id));
    const filteredAttData = (attData ?? []).filter((a: any) => activeStudentIds.has(a.student_id));

    const absentees = filteredAttData.filter((a: any) => a.status === 'AB' || a.status === 'L');
    const presentCount = filteredAttData.filter((a: any) => a.status === 'P').length;
    const totalStudents = (studentsData ?? []).length;

    // ✅ FIX 1: Add sync_master so the Students sheet in Google Sheets gets populated
    //           This is required for buildStrengthMap() in Apps Script to work correctly
    const actions = [
      {
        action: 'sync_master',
        students: studentsData ?? [],
      },
      {
        action: 'sync_attendance',
        date,
        records: filteredAttData,
      },
      {
        action: 'sync_absentees',
        date,
        absentees,
      },
      {
        // ✅ FIX 2: Use correct field names that Apps Script v6.6 expects
        action: 'sync_analytics',
        date,
        total_students: totalStudents,
        total: totalStudents,
        present_count: presentCount,
        present: presentCount,
        absent_count: absentees.length,
        absent: absentees.length,
      },
    ];

    // ✅ FIX 5: Collect errors instead of silently swallowing them
    const results: { action: string; success: boolean; error?: string }[] = [];
    for (const payload of actions) {
      try {
        const res = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          results.push({ action: payload.action, success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
        } else {
          const json = await res.json().catch(() => ({}));
          results.push({ action: payload.action, success: json.success !== false, error: json.error });
        }
      } catch (e: any) {
        results.push({ action: payload.action, success: false, error: e?.message ?? String(e) });
      }
    }

    const failures = results.filter(r => !r.success);
    return new Response(
      JSON.stringify({
        success: failures.length === 0,
        synced: actions.length - failures.length,
        total_actions: actions.length,
        dataset: activeSlug,
        total_students: totalStudents,
        attendance_records: filteredAttData.length,
        results,
        ...(failures.length > 0 ? { errors: failures.map(f => `${f.action}: ${f.error}`) } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: `Internal error: ${error instanceof Error ? error.message : String(error)}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    const { data: statusRow } = await supabaseAdmin.from('user_status').select('status').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['owner', 'admin', 'teacher'].includes(roleRow.role) || statusRow?.status !== 'active') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { date } = await req.json();
    if (!date) return new Response(JSON.stringify({ error: 'date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: scriptSetting } = await supabase.from('system_settings').select('value').eq('key', 'google_apps_script_url').single();
    const scriptUrl = scriptSetting?.value;
    if (!scriptUrl) return new Response(JSON.stringify({ success: false, error: 'Apps Script URL not configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const [{ data: studentsData }, { data: attData }] = await Promise.all([
      supabase.from('students').select('*').eq('enrollment_status', 'ENROLLED').neq('roll_no', ''),
      supabase.from('attendance').select('*, students(roll_no, student_name, classroom_name, emergency_contact_1, emergency_contact_2, grade, center)').eq('date', date),
    ]);

    const absentees = (attData ?? []).filter((a: any) => a.status === 'AB' || a.status === 'L');
    const presentCount = (attData ?? []).filter((a: any) => a.status === 'P').length;
    const totalStudents = (studentsData ?? []).length;

    const actions = [
      { action: 'sync_attendance', date, records: attData ?? [] },
      { action: 'sync_absentees', date, absentees },
      { action: 'sync_analytics', date, total: totalStudents, present: presentCount, absent: absentees.length },
    ];

    for (const payload of actions) {
      try { await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { console.warn(`Action ${payload.action} failed:`, e); }
    }

    return new Response(JSON.stringify({ success: true, synced: actions.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

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
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user)
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['owner', 'admin'].includes(roleRow.role))
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const url: string = (body?.url ?? '').trim();
    if (!url || !/^https:\/\//i.test(url))
      return new Response(JSON.stringify({ success: false, error: 'Valid https:// URL required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // SSRF protection: block private/reserved hosts and require Google Apps Script domain
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const host = parsedUrl.hostname.toLowerCase();
    const blockedHost = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc00:|fd00:|fe80:)/i;
    if (blockedHost.test(host)) {
      return new Response(JSON.stringify({ success: false, error: 'URL host not allowed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Allowlist: only Google Apps Script web app deployments are valid sync targets
    if (host !== 'script.google.com' && host !== 'script.googleusercontent.com') {
      return new Response(JSON.stringify({ success: false, error: 'Only Google Apps Script URLs (script.google.com) are allowed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping', date: new Date().toISOString().slice(0, 10) }),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      const trimmed = text.trim();
      const elapsed = Date.now() - start;
      const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');

      if (!res.ok) {
        const hint = isHtml && trimmed.includes('Page Not Found')
          ? 'Apps Script "Page Not Found". The URL is invalid or the deployment was deleted. Open Apps Script → Deploy → Manage deployments → New deployment as Web app (Execute as: Me, Who has access: Anyone), then paste the new /exec URL.'
          : isHtml ? 'Got HTML (likely a Google login page). Re-deploy the Apps Script with "Who has access: Anyone".'
          : `HTTP ${res.status} ${res.statusText}`;
        return new Response(JSON.stringify({ success: false, error: hint, http_status: res.status, elapsed_ms: elapsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (isHtml) {
        return new Response(JSON.stringify({ success: false, error: 'Returned HTML instead of JSON. Apps Script must respond with ContentService.createTextOutput(JSON.stringify(...)).', elapsed_ms: elapsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      return new Response(JSON.stringify({ success: true, elapsed_ms: elapsed, response: parsed ?? text.slice(0, 200) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e: any) {
      const elapsed = Date.now() - start;
      const msg = e?.message ?? String(e);
      return new Response(JSON.stringify({ success: false, error: msg.includes('abort') ? 'Timeout (25s) — Apps Script took too long to respond' : msg, elapsed_ms: elapsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('[test-sync-target] internal error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
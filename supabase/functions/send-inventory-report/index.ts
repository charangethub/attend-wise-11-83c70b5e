import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resendKey) {
      return new Response(JSON.stringify({
        error: 'RESEND_API_KEY is not configured. Add it under Lovable Cloud secrets to enable email reports.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const recipientEmail: string = (body.email || user.email || '').trim();
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return new Response(JSON.stringify({ error: 'A valid recipient email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull inventory using service role so RLS doesn't block reporting
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: items, error: invErr } = await admin
      .from('inventory_items')
      .select('item_name, zone, centre, grade, size, ytd_received, current_stock, distributed, damaged, missing, reserved')
      .order('item_name');
    if (invErr) throw invErr;

    const rows = items ?? [];
    const totals = rows.reduce((a: any, r: any) => {
      const avail = Math.max(0, (r.current_stock ?? 0) - (r.damaged ?? 0) - (r.missing ?? 0) - (r.reserved ?? 0));
      a.stock += r.current_stock ?? 0;
      a.available += avail;
      a.damaged += r.damaged ?? 0;
      a.distributed += r.distributed ?? 0;
      return a;
    }, { stock: 0, available: 0, damaged: 0, distributed: 0 });

    const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const tableRows = rows.map((r: any) => {
      const avail = Math.max(0, (r.current_stock ?? 0) - (r.damaged ?? 0) - (r.missing ?? 0) - (r.reserved ?? 0));
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.item_name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.grade || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.size || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.ytd_received ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.current_stock ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.distributed ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${r.damaged ?? 0}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;color:${avail > 0 ? '#16a34a' : '#dc2626'};">${avail}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="padding:20px 24px;background:#0f172a;color:#ffffff;">
          <h1 style="margin:0;font-size:20px;">📦 Inventory Report</h1>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Generated ${escapeHtml(reportDate)}</p>
        </div>
        <div style="padding:18px 24px;display:flex;flex-wrap:wrap;gap:10px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
          ${[
            ['Total Items', rows.length],
            ['Total Stock', totals.stock],
            ['Available', totals.available],
            ['Distributed', totals.distributed],
            ['Damaged', totals.damaged],
          ].map(([l, v]) => `<div style="flex:1;min-width:120px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
            <div style="font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:0.4px;">${l}</div>
            <div style="font-size:20px;font-weight:700;color:#111827;margin-top:2px;">${v}</div>
          </div>`).join('')}
        </div>
        <div style="padding:0 24px 8px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:14px;">
            <thead><tr style="background:#f3f4f6;">
              <th style="padding:10px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="padding:10px;text-align:left;border-bottom:2px solid #e5e7eb;">Grade</th>
              <th style="padding:10px;text-align:left;border-bottom:2px solid #e5e7eb;">Size</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;">YTD</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;">Stock</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;">Distributed</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;">Damaged</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e5e7eb;">Available</th>
            </tr></thead>
            <tbody>${tableRows || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#6b7280;">No inventory items.</td></tr>'}</tbody>
          </table>
        </div>
        <div style="padding:18px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;background:#f9fafb;">
          Sent by Vedantu Attendance Management System.
        </div>
      </div>
    </body></html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Inventory Report <onboarding@resend.dev>',
        to: [recipientEmail],
        subject: `📦 Inventory Report — ${reportDate}`,
        html,
      }),
    });

    const resJson = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: resJson?.message || 'Resend send failed', detail: resJson }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, sentTo: recipientEmail, items: rows.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

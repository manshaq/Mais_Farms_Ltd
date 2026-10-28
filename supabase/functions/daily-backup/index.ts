// ==============================================================================
// MAIS LTD: Supabase Edge Function - Daily Backup Trigger
// Scheduled via Supabase pg_cron to invoke at 02:00 UTC daily.
// ==============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized invocation' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:3000';
  try {
    const backupRes = await fetch(`${appUrl}/api/backup/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    const result = await backupRes.json();
    return new Response(
      JSON.stringify({
        status: backupRes.ok ? 'success' : 'failed',
        timestamp: new Date().toISOString(),
        details: result,
      }),
      {
        status: backupRes.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: err.message || 'Failed to trigger scheduled backup',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

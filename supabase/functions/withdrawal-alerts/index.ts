// ==============================================================================
// MAIS LTD: Supabase Edge Function - Active Withdrawal Alerts
// Scheduled via pg_cron to check daily for animals under active food safety hold.
// ==============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const today = new Date().toISOString().slice(0, 10);

  // Query treatments with active withdrawal days
  const { data: treatments, error } = await supabase
    .from('treatments')
    .select('id, animal_id, medicine, treatment_date, withdrawal_milk_days, withdrawal_meat_days')
    .or('withdrawal_milk_days.gt.0,withdrawal_meat_days.gt.0');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activeHolds = [];
  const now = new Date();

  for (const t of treatments || []) {
    const tDate = new Date(t.treatment_date);
    const diffDays = Math.floor((now.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
    const milkRemaining = Math.max(0, (t.withdrawal_milk_days || 0) - diffDays);
    const meatRemaining = Math.max(0, (t.withdrawal_meat_days || 0) - diffDays);

    if (milkRemaining > 0 || meatRemaining > 0) {
      activeHolds.push({
        treatmentId: t.id,
        animalId: t.animal_id,
        medicine: t.medicine,
        milkRemainingDays: milkRemaining,
        meatRemainingDays: meatRemaining,
      });
    }
  }

  return new Response(
    JSON.stringify({
      reportDate: today,
      totalActiveQuarantines: activeHolds.length,
      quarantinedAnimals: activeHolds,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});

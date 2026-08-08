/**
 * diag-services2.js — Tái hiện chính xác query của GET /api/services
 * và GET /api/admin/services để so sánh kết quả.
 * Chạy: node scripts/diag-services2.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  // Y hệt services/route.ts
  const { data: row, error } = await sb
    .from('landing_services')
    .select('description')
    .eq('is_active', true)
    .eq('group_name', '__services_content__')
    .limit(1)
    .maybeSingle();
  console.log('public query:', error ? `ERROR ${error.message}` : JSON.stringify(row));

  // Y hệt admin/services/route.ts (GET không filter is_active)
  const { data: row2, error: err2 } = await sb
    .from('landing_services')
    .select('description')
    .eq('group_name', '__services_content__')
    .limit(1)
    .maybeSingle();
  console.log('admin query (no is_active):', err2 ? `ERROR ${err2.message}` : JSON.stringify(row2));

  // Query thô không maybeSingle
  const { data: rows, error: err3 } = await sb
    .from('landing_services')
    .select('id,description,is_active,group_name')
    .eq('group_name', '__services_content__');
  console.log('raw rows:', err3 ? `ERROR ${err3.message}` : JSON.stringify(rows));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

/**
 * check-prod-services.js — Gọi production /api/admin/services và /api/services,
 * so sánh với service-key local. In ra kết quả.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

async function main() {
  const pw = process.env.ADMIN_PASSWORD || '';

  // 1. Production admin endpoint (dùng env production — service role key production)
  const r1 = await fetch('https://api-nu-drab.vercel.app/api/admin/services', {
    headers: { Authorization: `Bearer ${pw}` },
  });
  console.log('prod /api/admin/services:', r1.status, (await r1.text()).slice(0, 120));

  // 2. Production public endpoint
  const r2 = await fetch('https://api-nu-drab.vercel.app/api/services');
  console.log('prod /api/services:', r2.status, (await r2.text()).slice(0, 120));

  // 3. Supabase REST trực tiếp bằng service key LOCAL (xem row có tồn tại không)
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r3 = await fetch(
    `${url}/rest/v1/landing_services?group_name=eq.__services_content__&select=id,group_name,is_active,description`,
    { headers: { apikey: svc, Authorization: `Bearer ${svc}` } }
  );
  const body3 = await r3.json();
  console.log('REST service-key rows:', Array.isArray(body3) ? body3.length : body3);

  // 4. Supabase REST bằng anon key (như frontend)
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const r4 = await fetch(
    `${url}/rest/v1/landing_services?group_name=eq.__services_content__&select=id,group_name,is_active,description`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
  );
  const body4 = await r4.json();
  console.log('REST anon-key rows:', Array.isArray(body4) ? body4.length : JSON.stringify(body4));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

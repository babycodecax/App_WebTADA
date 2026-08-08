/**
 * diag-services.js — So sánh dữ liệu giữa service role key (local .env.local)
 * và anon key (public như production route dùng gì).
 * Mục tiêu: xác định vì sao GET /api/services production trả content="" trong
 * khi service key đọc được content đầy đủ.
 * Chạy: node scripts/diag-services.js (từ thư mục api/)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // 1. Service key — toàn quyền (giống local diag)
  const sbs = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: svcS, error: errS } = await sbs
    .from('landing_services')
    .select('id,group_name,is_active,description')
    .eq('group_name', '__services_content__')
    .limit(5);
  console.log('=== service key ===');
  if (errS) console.log('ERROR:', errS.message);
  else {
    console.log(`rows: ${svcS.length}`);
    svcS.forEach((r) => console.log(`  id=${r.id} active=${r.is_active} len=${(r.description || '').length} desc=${(r.description || '').slice(0, 60)}`));
  }

  // 2. Thử anon key từ /api/config (public, giống client-side)
  const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_PnBKcAZJ9OSxkgeAcJbmEQ_0NzEnPJ9';
  const sba = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: svcA, error: errA } = await sba
    .from('landing_services')
    .select('id,group_name,is_active,description')
    .eq('group_name', '__services_content__')
    .limit(5);
  console.log('\n=== anon key (RLS?) ===');
  if (errA) console.log('ERROR:', errA.message);
  else {
    console.log(`rows: ${svcA.length}`);
    svcA.forEach((r) => console.log(`  id=${r.id} active=${r.is_active} len=${(r.description || '').length} desc=${(r.description || '').slice(0, 60)}`));
  }

  // 3. source_documents qua anon — production trả title đầy đủ (Luật 109/2025...) trong khi local service trả basename? Kiểm tra cả 2.
  for (const [label, sb] of [['service', sbs], ['anon', sba]]) {
    const { data, error } = await sb
      .from('source_documents')
      .select('file_path,title')
      .eq('file_path', 'luat-109-2025-tncn.md')
      .limit(1);
    console.log(`\n=== source_documents luat-109 via ${label} ===`);
    console.log(error ? 'ERROR: ' + error.message : JSON.stringify(data));
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

// Script debug tạm: chạy query bằng env Vercel so sánh với local
// KHÔNG in key — chỉ in kết quả query + độ dài content.
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.vercel') });

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const q1 = await sb.from('landing_services').select('description').eq('is_active', true).eq('group_name', '__services_content__').limit(1).maybeSingle();
  console.log('VERCEL-ENV active:', q1.data ? 'FOUND len=' + q1.data.description.length : 'null', q1.error ? 'ERR: ' + q1.error.message : '');
  const q2 = await sb.from('landing_services').select('description').eq('group_name', '__services_content__').limit(1).maybeSingle();
  console.log('VERCEL-ENV fallback:', q2.data ? 'FOUND len=' + q2.data.description.length : 'null', q2.error ? 'ERR: ' + q2.error.message : '');

  // So sánh với .env local
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const sb2 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const q3 = await sb2.from('landing_services').select('description').eq('group_name', '__services_content__').limit(1).maybeSingle();
  console.log('LOCAL-ENV fallback:', q3.data ? 'FOUND len=' + q3.data.description.length : 'null', q3.error ? 'ERR: ' + q3.error.message : '');
})();

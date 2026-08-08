// Kiểm tra nhanh bảng landing_legal_docs: đếm + lấy mẫu (KHÔNG in key)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await sb.from('landing_legal_docs').select('id,title,doc_type,doc_number,file_name').order('created_at', { ascending: false }).limit(5);
  if (error) { console.log('ERR:', error.message); return; }
  const { count } = await sb.from('landing_legal_docs').select('id', { count: 'exact', head: true });
  console.log('TOTAL rows:', count);
  (data || []).forEach(r => console.log(' -', r.title, '|', r.doc_type, '|', r.doc_number, '|', r.file_name));
})();

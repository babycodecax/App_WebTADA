#!/usr/bin/env node
/**
 * verifySourceMap.js — Rà soát toàn bộ mapping source_documents ↔ file docx Storage.
 *
 * Với mỗi nguồn vault: download docx từ Storage → extract text → trích
 * "Số: NN/YYYY" (số hiệu văn bản) → so với file_path (chứa NN-YYYY). Báo cáo
 * mismatch để phát hiện nguồn lẫn lộn.
 *
 * Cách chạy: cd scripts && node verifySourceMap.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const mammoth = require('mammoth');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPA_URL, SUPA_KEY);
const BUCKET = 'vault-sources';

// Map đặc biệt: file_path không chứa số-năm chuẩn → số hiệu docx kỳ vọng
const SPECIAL_EXPECT = {
  'bo-luat-dan-su-2015.md': '91/2015',           // Bộ luật Dân sự
  'vbhn-luat-thue-xnk-107-2016.md': '107/2016',  // Luật XNK hợp nhất (96/VBHN)
  'vbhn-luat-doanh-nghiep-2025.md': '59/2020',   // Luật DN hợp nhất (67/VBHN)
  'luat-thue-tncn-2025.md': '109/2025',          // Bản tóm tắt nguồn Luật TNCN
  'nd-359-2025-gtgt.md': '359/2025',
  'nd-360-2025-ttdb.md': '360/2025',
  'tt-91-2026.md': '91/2026',                    // Thong-tu-91-2026 (tên có dấu)
};

async function extractDocNumber(text) {
  // Tìm "Số: NN/YYYY" hoặc "Luật số: NN/YYYY" đầu tiên
  const m = text.match(/(?:Số|số|Luật số|Nghị định số|Thông tư số)\s*:?\s*(\d{1,4})\s*\/\s*(\d{4})/);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

async function main() {
  const { data: sources } = await supabase
    .from('source_documents')
    .select('file_path,storage_path,title')
    .eq('source_origin', 'vault')
    .limit(100);

  let ok = 0, warn = 0, fail = 0;
  console.log('=== Rà soát mapping nguồn ↔ file word gốc ===\n');

  for (const src of (sources || [])) {
    const fp = src.file_path || '';
    const storagePath = src.storage_path || '';
    if (!storagePath) {
      console.log(`⚠️  ${fp} — CHƯA có storage_path`);
      warn++;
      continue;
    }

    // Download + extract
    let docNum = null, errMsg = '';
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw new Error(error?.message || 'download fail');
      const buf = Buffer.from(await data.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer: buf });
      docNum = await extractDocNumber(value);
    } catch (e) {
      errMsg = e.message || 'lỗi';
    }

    // Kỳ vọng từ file_path
    let expectNum = SPECIAL_EXPECT[fp] || null;
    if (!expectNum) {
      const m = fp.match(/(\d{1,4})[-_](\d{4})/);
      if (m) expectNum = `${m[1]}/${m[2]}`;
    }

    if (errMsg) {
      console.log(`❌ ${fp}\n    ${storagePath} — LỖI đọc: ${errMsg}`);
      fail++;
    } else if (!docNum) {
      console.log(`⚠️  ${fp}\n    ${storagePath} — không trích được số hiệu`);
      warn++;
    } else if (expectNum && docNum !== expectNum) {
      console.log(`❌ ${fp}\n    kỳ vọng: ${expectNum} | docx thực tế: ${docNum} | file: ${storagePath}`);
      fail++;
    } else {
      console.log(`✅ ${fp} — ${docNum} (${storagePath})`);
      ok++;
    }
  }

  console.log(`\n=== Kết quả: ${ok} đúng, ${warn} cảnh báo, ${fail} lỗi ===`);
}

main().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
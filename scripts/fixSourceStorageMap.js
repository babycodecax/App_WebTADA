#!/usr/bin/env node
/**
 * fixSourceStorageMap.js — Sửa storage_path của các nguồn vault bị map sai,
 * dựa trên số hiệu văn bản thực tế (đã trích từ nội dung docx bằng mammoth).
 *
 * Các lỗi đã xác định:
 *   - bo-luat-dan-su-2015.md  → 41_2024 (Luật BHXH) SAI → 91_2015 (Bộ luật DS)
 *   - vbhn-luat-thue-xnk      → 91_2015 (Bộ luật DS) SAI → 96_VBHN (Luật XNK)
 *   - nd-360-2025-ttdb.md     → nd360.docx (NĐ 359 rác) SAI → 360_2025 (TTĐB)
 *   - nd-320-2025-tndn.md     → nd320.docx (tên không chuẩn) → 320_2025 chuẩn
 *   - Xóa file rác vault/nd360.docx (nội dung NĐ 359 GTGT trùng)
 *   - Rename vault/nd320.docx → vault/320_2025_ND-CP_665051.docx
 *
 * Cách chạy: cd scripts && node verifySourceMap.js (xem trước báo cáo)
 *             cd scripts && node fixSourceStorageMap.js (thực hiện sửa)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPA_URL, SUPA_KEY);
const BUCKET = 'vault-sources';

// ─── Bảng map ĐẦY ĐỦ chuẩn cho verify (file_path → đúng số hiệu kỳ vọng) ───
// Dựa trên số hiệu văn bản thực tế trích từ nội dung docx (mammoth).
const CORRECT_MAP = {
  'bo-luat-dan-su-2015.md': 'vault/91_2015_QH13_296215.docx',
  'vbhn-luat-thue-xnk-107-2016.md': 'vault/96_VBHN-VPQH_699728.docx',
  'nd-360-2025-ttdb.md': 'vault/360_2025_ND-CP_m_318217.docx',
  'nd-320-2025-tndn.md': 'vault/320_2025_ND-CP_665051.docx',
  'nd-359-2025-gtgt.md': 'vault/359_2025_ND-CP_679684.docx',
  'vbhn-luat-doanh-nghiep-2025.md': 'vault/67_VBHN-VPQH_671127.docx',
  'luat-thue-tncn-2025.md': 'vault/109_2025_QH15_665870.docx', // bản tóm tắt nguồn luật TNCN
};

async function main() {
  const dryRun = process.argv.includes('--dry') || process.argv.includes('-n');
  if (dryRun) console.log('== DRY RUN (chỉ hiển thị, không ghi) ==');

  // 1. Liệt kê nguồn vault hiện tại
  const { data: sources } = await supabase
    .from('source_documents')
    .select('file_path,storage_path,title')
    .eq('source_origin', 'vault')
    .limit(100);

  const fixes = [];
  for (const src of (sources || [])) {
    const fp = src.file_path || '';
    const expect = CORRECT_MAP[fp] || null;
    const cur = src.storage_path || '';
    if (expect && cur !== expect) {
      fixes.push({ fp, title: src.title, from: cur, to: expect });
    }
  }

  console.log('=== Các nguồn cần sửa storage_path ===');
  for (const f of fixes) {
    console.log(`  ${f.fp}\n    từ: ${f.from || '(rỗng)'}\n    đến: ${f.to}`);
  }
  console.log(`\nTổng: ${fixes.length} nguồn cần sửa\n`);

  if (dryRun) return;

  // 2. Sửa storage_path
  for (const f of fixes) {
    const { error } = await supabase
      .from('source_documents')
      .update({ storage_path: f.to })
      .eq('file_path', f.fp);
    if (error) console.error(`Update ${f.fp} thất bại:`, error.message);
    else console.log(`✓ Đã sửa ${f.fp} → ${f.to}`);
  }

  // 3. Dọn file rác / rename
  console.log('\n=== Dọn file Storage ===');
  // nd360.docx chứa NĐ 359 (rác) → xóa
  const { data: list } = await supabase.storage.from(BUCKET).list('vault', { limit: 100 });
  const names = (list || []).map(f => f.name);
  if (names.includes('nd360.docx')) {
    console.log('Phát hiện vault/nd360.docx (nội dung NĐ 359 rác) — xóa...');
    await cleanupFile('vault/nd360.docx');
  }
  if (names.includes('nd320.docx')) {
    console.log('Rename vault/nd320.docx → vault/320_2025_ND-CP_665051.docx...');
    await renameFile('vault/nd320.docx', 'vault/320_2025_ND-CP_665051.docx');
  }
  console.log('\nXong!');
}

async function cleanupFile(key) {
  await supabase.storage.from(BUCKET).remove([key]);
  console.log('  Đã xóa', key);
}
async function renameFile(src, dst) {
  const { data } = await supabase.storage.from(BUCKET).download(src);
  const buf = Buffer.from(await data.arrayBuffer());
  await supabase.storage.from(BUCKET).upload(dst, buf, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  });
  await supabase.storage.from(BUCKET).remove([src]);
  console.log(`  ${src} → ${dst}`);
}

main().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
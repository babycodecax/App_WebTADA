#!/usr/bin/env node
/**
 * uploadVaultDocxToStorage.js — Upload 41 file docx gốc từ vault/thue-ke-toan/sources/
 * lên Supabase Storage, đồng bộ source_documents.storage_path.
 *
 * Cách chạy:
 *   cd scripts && node uploadVaultDocxToStorage.js
 *
 * Env cần: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Bucket: vault-sources (tự tạo nếu chưa có)
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
const SOURCES_DIR = path.join(__dirname, '..', 'vault', 'thue-ke-toan', 'sources');

// ─── Heuristic map: file_path.md → sources/ .docx filename ───
// Pattern: luat-149-2025-gtgt.md → tìm file có '149_2025' trong tên sources/
// Pattern: nd-141-2026-*.md → tìm file có '141_2026'
// Pattern: tt-94-2026.md → tìm file có '94_2026'
// Pattern: nq-198-2025-*.md → tìm file có '198_2025'
// Pattern: bo-luat-dan-su-2015.md → tìm file có 'bo-luat-dan-su-2015' (特殊处理)
// Bảng map thủ công cho các file đặc biệt (không match regex số+năm)
const MANUAL_MAP = {
  'bo-luat-dan-su-2015.md': '41_2024_QH15_557190.docx', // Bộ luật Dân sự 2015
  'luat-thue-tncn-2025.md': '109_2025_QH15_665870.docx', // Bản tóm tắt TNCN
  'vbhn-luat-thue-xnk-107-2016.md': '91_2015_QH13_296215.docx', // VBHN Luật XK/NK
  'vbhn-luat-doanh-nghiep-2025.md': '67_VBHN-VPQH_671127.docx', // VBHN Luật DN
  'tt-91-2026.md': 'Thông-tư-91-2026-TT-BTC.docx', // TT 91/2026 tên特殊
  'tt-96-2025.md': '96_VBHN-VPQH_699728.docx', // VBHN 96/2025
  'nd-181-2025.md': '181_2025_ND-CP_m_646124.docx',
  'nd-320-2025-tndn.md': 'nd320.docx',
  'nd-360-2025-ttdb.md': 'nd360.docx',
};

function normalizeName(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // bỏ dấu
    .replace(/[^a-z0-9]/g, ' '); // chỉ giữ alphanumeric + space
}

function extractNumYearFromFilePath(fp) {
  const base = fp.replace(/\.md$/, '');
  // Thử regex: 1-4 chữ số + separator (gạch dưới/ngang) + 4 chữ số năm
  const m = base.match(/(\d{1,4})[_-](\d{4})/);
  if (m) return { num: m[1], year: m[2] };
  return null;
}

function matchDocx(file_path, docxFiles) {
  // 1. Thử map thủ công trước
  if (MANUAL_MAP[file_path]) {
    const mapped = MANUAL_MAP[file_path];
    if (docxFiles.includes(mapped)) return mapped;
  }
  // 2. Regex num + year
  const info = extractNumYearFromFilePath(file_path);
  if (info) {
    const pattern = `${info.num}_${info.year}`;
    const match = docxFiles.find(f => f.includes(pattern));
    if (match) return match;
    // Thử cả pattern num-year (gạch ngang) trong tên file
    const match2 = docxFiles.find(f => f.includes(`${info.num}-${info.year}`));
    if (match2) return match2;
  }
  // 3. Fuzzy: normalize cả 2 bên → tìm overlap cao nhất
  const normFP = normalizeName(file_path);
  let bestScore = 0, bestMatch = null;
  for (const f of docxFiles) {
    const normF = normalizeName(f);
    // Đếm số token chung
    const fpTokens = normFP.split(/\s+/).filter(Boolean);
    const fTokens = normF.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const t of fpTokens) {
      if (fTokens.some(ft => ft.includes(t) || t.includes(ft))) score++;
    }
    if (score > bestScore) { bestScore = score; bestMatch = f; }
  }
  return bestScore >= 2 ? bestMatch : null;
}

async function createBucket() {
  try {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !error.message?.includes('already exists')) {
      console.error('Tạo bucket thất bại:', error.message);
    } else {
      console.log(`Bucket "${BUCKET}" sẵn sàng.`);
    }
  } catch (e) {
    // Bucket có thể đã tồn tại — bỏ qua
  }
}

async function main() {
  // 1. Scan sources/*.docx
  if (!fs.existsSync(SOURCES_DIR)) {
    console.error('Không tìm thấy thư mục sources:', SOURCES_DIR);
    process.exit(1);
  }
  const docxFiles = fs.readdirSync(SOURCES_DIR).filter(f => f.endsWith('.docx'));
  console.log(`Tìm thấy ${docxFiles.length} file docx trong sources/`);

  // 2. Tạo bucket
  await createBucket();

  // 3. Upload từng file docx lên Storage
  let uploaded = 0, errors = 0;
  for (const f of docxFiles) {
    const filePath = path.join(SOURCES_DIR, f);
    const content = fs.readFileSync(filePath);
    const storageKey = `vault/${f}`;
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storageKey, content, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });
      if (error) {
        console.error(`Upload ${f} thất bại:`, error.message);
        errors++;
      } else {
        uploaded++;
        if (uploaded % 10 === 0) console.log(`  Đã upload ${uploaded}/${docxFiles.length}`);
      }
    } catch (e) {
      console.error(`Upload ${f} lỗi:`, e.message);
      errors++;
    }
  }
  console.log(`Upload xong: ${uploaded} thành công, ${errors} lỗi`);

  // 4. Map source_documents → storage_path
  const { data: sources } = await supabase
    .from('source_documents')
    .select('file_path,storage_path')
    .eq('source_origin', 'vault')
    .limit(100);

  let mapped = 0, unmapped = 0;
  for (const src of (sources || [])) {
    const fp = src.file_path || '';
    const matched = matchDocx(fp, docxFiles);
    if (matched) {
      const storagePath = `vault/${matched}`;
      if (src.storage_path !== storagePath) {
        const { error } = await supabase
          .from('source_documents')
          .update({ storage_path: storagePath })
          .eq('file_path', fp);
        if (error) {
          console.error(`Update ${fp} storage_path thất bại:`, error.message);
          unmapped++;
        } else {
          mapped++;
        }
      }
    } else {
      console.log(`Không map được: ${fp}`);
      unmapped++;
    }
  }
  console.log(`Mapping xong: ${mapped} updated, ${unmapped} không map được`);
  console.log('Xong!');
}

main().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });

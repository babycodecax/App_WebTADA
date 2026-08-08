/**
 * scripts/ingest-legal-docs.ts — Bulk import 41 file .docx từ thư mục VB luật
 * vào bảng landing_legal_docs (Thư viện trang riêng /thu-vien).
 *
 * Cách chạy (từ thư mục api/, cần .env.local có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node --import tsx scripts/ingest-legal-docs.ts [--dir="D:\VB luật\Kế toán, thuế"] [--dry-run]
 *
 * - Parse từng file bằng mammoth.convertToHtml({buffer}) — GIỮ BẢNG BIỂU như bản Word gốc.
 * - Sinh title tiếng Việt chuẩn từ cấu trúc VBPL (bảng tiêu đề + anchor loai_1).
 * - Upsert theo file_name (onConflict) — chạy lại nhiều lần không tạo trùng.
 * - Không đụng vault/ (nguồn gốc — chỉ đọc thư mục VB luật ngoài).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const mammoth = (await import('mammoth')).default as typeof import('mammoth');

/** Tải .env.local (cùng pattern lib/supabase.ts) — cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. */
function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('[ingest-legal-docs] Thiếu .env.local — chạy từ thư mục api/');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(): { dir: string; dryRun: boolean } {
  let dir = 'D:\\VB luật\\Kế toán, thuế';
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--dir=')) dir = arg.slice('--dir='.length);
  }
  return { dir, dryRun };
}

async function main(): Promise<void> {
  loadEnv();
  const { dir, dryRun } = parseArgs();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[ingest-legal-docs] Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { extractLegalTitleFromHtml, buildLegalDocRow, upsertLegalDoc } = await import('@/lib/legalDocIngest');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  if (!fs.existsSync(dir)) {
    console.error(`[ingest-legal-docs] Thư mục không tồn tại: ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .sort();
  if (!files.length) {
    console.error(`[ingest-legal-docs] Không có file .docx trong ${dir}`);
    process.exit(1);
  }

  console.log(`[ingest-legal-docs] Tìm thấy ${files.length} file .docx trong ${dir}`);
  if (dryRun) console.log('[ingest-legal-docs] MODE: --dry-run (không ghi DB)');

  let ok = 0;
  let fail = 0;
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const buf = fs.readFileSync(filePath);
      const html = (await mammoth.convertToHtml({ buffer: buf })).value;
      const meta = extractLegalTitleFromHtml(html, file);
      const row = buildLegalDocRow({
        html,
        title: meta.title,
        doc_type: meta.doc_type,
        doc_number: meta.doc_number,
        fileName: file,
        fileUrl: '',
      });

      if (dryRun) {
        console.log(`  [dry] ${meta.doc_type.padEnd(5)} ${meta.doc_number.padEnd(16)} ${meta.title.slice(0, 90)}`);
        ok++;
        continue;
      }

      const res = await upsertLegalDoc(sb, row);
      if (res.ok) {
        console.log(`  [ok]  ${meta.doc_type.padEnd(5)} ${meta.doc_number.padEnd(16)} ${meta.title.slice(0, 90)}`);
        ok++;
      } else {
        console.error(`  [ERR] ${file}: ${res.error}`);
        fail++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
      console.error(`  [ERR] ${file}: ${msg}`);
      fail++;
    }
  }

  console.log(`\n[ingest-legal-docs] Xong: ${ok} ok, ${fail} fail${dryRun ? ' (dry-run)' : ''}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error('[ingest-legal-docs] Lỗi không xác định:', e);
  process.exit(1);
});

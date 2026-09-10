/**
 * validate-blog-laws.js — Kiểm tra tự động luật cũ + kiến thức sai trong tất cả bài blog
 *
 * Chạy trước khi upload/deploy để tránh dẫn luật sai.
 * Dựa trên bảng đối chiếu từ vault cheatsheet 2026.
 *
 * Checks:
 * 1. Luật cũ (NĐ 125/2020, Luật 38/2019, etc.)
 * 2. Thuế khoán (đã chấm dứt từ 01/01/2026)
 * 3. CJK characters (tiếng Trung/Nhật/Hàn)
 * 4. Frontmatter leak (content bắt đầu bằng ---)
 *
 * Usage: node tools/validate-blog-laws.js
 * Exit code: 0 = pass, 1 = có lỗi
 */

const fs = require('fs');
const path = require('path');

// ── Bảng đối chiếu luật cũ → mới (source of truth từ vault) ──
const LAW_REPLACEMENTS = [
  {
    old: /Nghị định 125\/2020|NĐ\.?\s*125\/2020/g,
    newLaw: 'Nghị định 310/2025/NĐ-CP',
    note: 'Xử phạt vi phạm hành chính thuế',
    severity: 'CRITICAL',
  },
  {
    old: /Nghị định 123\/2020|NĐ\.?\s*123\/2020/g,
    newLaw: 'Nghị định 254/2026/NĐ-CP',
    note: 'Hóa đơn điện tử',
    severity: 'HIGH',
  },
  {
    old: /Nghị định 126\/2020|NĐ\.?\s*126\/2020/g,
    newLaw: 'Nghị định 252/2026/NĐ-CP',
    note: 'Quản lý thuế',
    severity: 'HIGH',
  },
  {
    old: /Luật 38\/2019/g,
    newLaw: 'Luật 108/2025/QH15',
    note: 'Quản lý thuế (sửa đổi)',
    severity: 'HIGH',
  },
  {
    old: /Luật 04\/2007/g,
    newLaw: 'Luật 109/2025/QH15',
    note: 'Thuế TNCN',
    severity: 'HIGH',
  },
  {
    old: /Luật 14\/2020/g,
    newLaw: 'Luật 67/2025/QH15',
    note: 'Thuế TNDN',
    severity: 'MEDIUM',
  },
  {
    old: /Luật 59\/2020/g,
    newLaw: 'Luật 76/2025/QH15',
    note: 'Doanh nghiệp',
    severity: 'MEDIUM',
  },
  {
    old: /Thông tư 78\/2021|TT\.?\s*78\/2021/g,
    newLaw: 'Thông tư 91/2026/TT-BTC',
    note: 'HĐĐT hướng dẫn',
    severity: 'MEDIUM',
  },
  {
    old: /Luật 48\/2024\/QH15/g,
    newLaw: 'Luật 48/2024 (sđ bởi Luật 149/2025, Luật 09/2026)',
    note: 'Thuế GTGT — cần dẫn đầy đủ chuỗi sửa đổi',
    severity: 'MEDIUM',
    requireAmendment: true,
  },
];

// ── Lệ phí môn bài check (chấm dứt từ 01/01/2026) ──
const MON_BAI_PATTERNS = [/lệ phí môn bài/gi, /phí môn bài/gi];
const MON_BAI_ABORT_CONTEXT = /chấm dứt.*môn bài|môn bài.*chấm dứt|bị bãi bỏ.*môn bài|môn bài.*bị bãi bỏ|đã chấm dứt.*môn bài|môn bài.*đã chấm dứt|không còn.*môn bài|NQ 198.*môn bài|môn bài.*NQ 198|bị chấm dứt.*môn bài|môn bài.*bị chấm dứt|đã bị chấm dứt.*môn bài|môn bài.*đã bị chấm dứt/gi;

// ── Thuế khoán check (context-aware) ──
// Chỉ flag nếu "thuế khoán" được dùng như ĐANG ÁP DỤNG, không phải:
// - Đang giải thích đã chấm dứt
// - "khoán" trong ngữ cảnh lao động (khoán hay lương cố định)
const THUE_KHOAN_PATTERNS = [
  /áp dụng thuế khoán/gi,
  /thuế khoán.*hàng tháng/gi,
  /định mức thuế khoán/gi,
  /khoán.*cố định.*thuế/gi,
  /nhóm.*khoán.*thuế/gi,
  /thuế.*nhóm.*khoán/gi,
];

const THUE_KHOAN_ABORT_CONTEXT = /chấm dứt.*khoán|khoán.*chấm dứt|bị bãi bỏ.*khoán|khoán.*bị bãi bỏ|không.*còn.*khoán|đã chấm dứt|phương pháp khoán.*bị|xóa.*khoán/gi;
// Bỏ qua nếu "khoán" xuất hiện trong ngữ cảnh lao động (không phải thuế)
const THUE_KHOAN_LABOR_CONTEXT = /khoán.*lương|lương.*khoán|lương cố định|khoán hay|thuê khoán|đại lý khoán/gi;

// ── CJK character check ──
const CJK_REGEX = /[一-鿿㐀-䶿豈-﫿　-〿＀-￯]/g;

// ── Collect all .md files ──
function collectFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── Main ──
function main() {
  const blogDir = path.join(__dirname, 'blog-content');
  const files = collectFiles(blogDir);

  console.log(`\n🔍 Kiểm tra chất lượng trong ${files.length} bài blog...\n`);

  let totalIssues = 0;
  const issuesByFile = {};

  for (const filePath of files) {
    const relPath = path.relative(blogDir, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileIssues = [];

    // ── Check 1: Luật cũ (skip nếu trong ngữ cảnh "thay thế") ──
    for (const rule of LAW_REPLACEMENTS) {
      const matches = content.match(rule.old);
      if (matches) {
        if (rule.requireAmendment) {
          const hasAmendment = /Luật 149\/2025|Luật 09\/2026/.test(content);
          if (hasAmendment) continue;
        }
        // Kiểm tra ngữ cảnh: nếu luật cũ xuất hiện trong câu "thay thế X" → skip
        let realCount = 0;
        for (const m of matches) {
          const idx = content.indexOf(m);
          const context = content.substring(Math.max(0, idx - 50), Math.min(content.length, idx + m.length + 50));
          if (!/thay thế|thay the|sửa đổi|thay cho|đã thay|thay bởi/i.test(context)) {
            realCount++;
          }
        }
        if (realCount > 0) {
          fileIssues.push({
            type: 'LAW',
            severity: rule.severity,
            note: rule.note,
            count: realCount,
            detail: `Luật cũ (không phải "thay thế"): ${matches[0]} → Thay bằng: ${rule.newLaw}`,
          });
          totalIssues += realCount;
        }
      }
    }

    // ── Check 2: Lệ phí môn bài (chấm dứt từ 01/01/2026) ──
    for (const pattern of MON_BAI_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        const hasAbortContext = new RegExp(MON_BAI_ABORT_CONTEXT.source, MON_BAI_ABORT_CONTEXT.flags).test(content);
        if (!hasAbortContext) {
          fileIssues.push({
            type: 'MON_BAI',
            severity: 'HIGH',
            note: 'Lệ phí môn bài đã chấm dứt từ 01/01/2026 (NQ 198/2025)',
            count: matches.length,
            detail: `Lệ phí môn bài đang được dùng như đang áp dụng: "${matches[0]}"`,
          });
          totalIssues += matches.length;
        }
      }
    }

    // ── Check 3: Thuế khoán (context-aware) ──
    for (const pattern of THUE_KHOAN_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        // Skip nếu trong ngữ cảnh "chấm dứt" hoặc ngữ cảnh lao động
        const hasAbortContext = new RegExp(THUE_KHOAN_ABORT_CONTEXT.source, THUE_KHOAN_ABORT_CONTEXT.flags).test(content);
        const hasLaborContext = new RegExp(THUE_KHOAN_LABOR_CONTEXT.source, THUE_KHOAN_LABOR_CONTEXT.flags).test(content);
        if (!hasAbortContext && !hasLaborContext) {
          fileIssues.push({
            type: 'KHOAN',
            severity: 'CRITICAL',
            note: 'Thuế khoán đã chấm dứt từ 01/01/2026 (NQ 198/2025)',
            count: matches.length,
            detail: `Thuế khoán đang được dùng như đang áp dụng: "${matches[0]}"`,
          });
          totalIssues += matches.length;
        }
      }
    }

    // ── Check 3: CJK characters ──
    const cjkMatches = content.match(CJK_REGEX);
    if (cjkMatches) {
      fileIssues.push({
        type: 'CJK',
        severity: 'HIGH',
        note: 'Ký tự tiếng Trung/Nhật/Hàn — cần xóa hoặc dịch',
        count: cjkMatches.length,
        detail: `Tìm thấy ${cjkMatches.length} ký tự: ${cjkMatches.slice(0, 5).join('')}`,
      });
      totalIssues += cjkMatches.length;
    }

    // ── Check 4: Frontmatter leak (chỉ check nếu content SAU khi parse frontmatter vẫn bắt đầu bằng ---) ──
    const parsedMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    if (parsedMatch && parsedMatch[1].trimStart().startsWith('---')) {
      fileIssues.push({
        type: 'FRONTMATTER',
        severity: 'CRITICAL',
        note: 'Content chứa frontmatter thừa — cần strip trước khi upload Supabase',
        count: 1,
        detail: 'Content sau frontmatter vẫn bắt đầu bằng ---',
      });
      totalIssues += 1;
    }

    if (fileIssues.length > 0) {
      issuesByFile[relPath] = fileIssues;
    }
  }

  // ── Output ──
  if (totalIssues === 0) {
    console.log('✅ TẤT CẢ SẠCH! Không tìm thấy vấn đề nào.\n');
    process.exit(0);
  }

  const criticalCount = Object.values(issuesByFile).flat().filter(i => i.severity === 'CRITICAL').length;
  const highCount = Object.values(issuesByFile).flat().filter(i => i.severity === 'HIGH').length;

  console.log(`❌ Tìm thấy ${totalIssues} vấn đề:\n`);
  console.log(`   🔴 CRITICAL: ${criticalCount}`);
  console.log(`   🟠 HIGH: ${highCount}\n`);

  for (const [file, issues] of Object.entries(issuesByFile)) {
    console.log(`📄 ${file}`);
    for (const issue of issues) {
      const icon = issue.severity === 'CRITICAL' ? '🔴' : '🟡';
      console.log(`   ${icon} [${issue.type}] ${issue.note} (${issue.count} chỗ)`);
      console.log(`      ${issue.detail}`);
    }
    console.log('');
  }

  console.log(`═══════════════════════════════════════════`);
  console.log(`📊 Tổng: ${totalIssues} vấn đề trong ${Object.keys(issuesByFile).length} file`);
  console.log(`═══════════════════════════════════════════\n`);

  process.exit(1);
}

main();

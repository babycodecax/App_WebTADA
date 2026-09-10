/**
 * fix-blog-laws.js — Tự động thay thế luật cũ → mới trong tất cả bài blog
 *
 * Dựa trên bảng đối chiếu từ vault cheatsheet 2026.
 * Chạy validate-blog-laws.js trước để xác nhận, rồi chạy script này.
 *
 * Usage: node tools/fix-blog-laws.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Bảng thay thế luật cũ → mới ──
const REPLACEMENTS = [
  // NĐ 125/2020 → NĐ 310/2025 (Xử phạt)
  { old: /Nghị định 125\/2020\/NĐ-CP/g, new: 'Nghị định 310/2025/NĐ-CP' },
  { old: /Nghị định 125\/2020/g, new: 'Nghị định 310/2025/NĐ-CP' },
  { old: /NĐ\.?\s*125\/2020\/NĐ-CP/g, new: 'NĐ 310/2025/NĐ-CP' },
  { old: /NĐ\.?\s*125\/2020/g, new: 'NĐ 310/2025' },

  // NĐ 123/2020 → NĐ 254/2026 (HĐĐT)
  { old: /Nghị định 123\/2020\/NĐ-CP/g, new: 'Nghị định 254/2026/NĐ-CP' },
  { old: /Nghị định 123\/2020/g, new: 'Nghị định 254/2026' },
  { old: /NĐ\.?\s*123\/2020\/NĐ-CP/g, new: 'NĐ 254/2026/NĐ-CP' },
  { old: /NĐ\.?\s*123\/2020/g, new: 'NĐ 254/2026' },

  // NĐ 126/2020 → NĐ 252/2026 (Quản lý thuế)
  { old: /Nghị định 126\/2020\/NĐ-CP/g, new: 'Nghị định 252/2026/NĐ-CP' },
  { old: /Nghị định 126\/2020/g, new: 'Nghị định 252/2026' },
  { old: /NĐ\.?\s*126\/2020\/NĐ-CP/g, new: 'NĐ 252/2026/NĐ-CP' },
  { old: /NĐ\.?\s*126\/2020/g, new: 'NĐ 252/2026' },

  // Luật 38/2019 → Luật 108/2025 (Quản lý thuế)
  { old: /Luật 38\/2019\/QH14/g, new: 'Luật 108/2025/QH15' },
  { old: /Luật 38\/2019/g, new: 'Luật 108/2025' },

  // Luật 04/2007 → Luật 109/2025 (Thuế TNCN)
  { old: /Luật 04\/2007\/QH12/g, new: 'Luật 109/2025/QH15' },
  { old: /Luật 04\/2007/g, new: 'Luật 109/2025' },

  // Luật 14/2020 → Luật 67/2025 (Thuế TNDN)
  { old: /Luật 14\/2020\/QH14/g, new: 'Luật 67/2025/QH15' },
  { old: /Luật 14\/2020/g, new: 'Luật 67/2025' },

  // Luật 59/2020 → Luật 76/2025 (Doanh nghiệp)
  { old: /Luật 59\/2020\/QH14/g, new: 'Luật 76/2025/QH15' },
  { old: /Luật 59\/2020/g, new: 'Luật 76/2025' },

  // TT 78/2021 → TT 91/2026 (HĐĐT hướng dẫn)
  { old: /Thông tư 78\/2021\/TT-BTC/g, new: 'Thông tư 91/2026/TT-BTC' },
  { old: /Thông tư 78\/2021/g, new: 'Thông tư 91/2026' },
  { old: /TT\.?\s*78\/2021\/TT-BTC/g, new: 'TT 91/2026/TT-BTC' },
  { old: /TT\.?\s*78\/2021/g, new: 'TT 91/2026' },
];

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

  console.log(`\n${DRY_RUN ? '🔍 DRY RUN' : '🔧 FIX'}: Kiểm tra ${files.length} bài blog...\n`);

  let totalFixed = 0;
  let filesModified = 0;

  for (const filePath of files) {
    const relPath = path.relative(blogDir, filePath);
    let content = fs.readFileSync(filePath, 'utf-8');
    let fileFixed = 0;
    const changes = [];

    for (const rule of REPLACEMENTS) {
      const before = content;
      content = content.replace(rule.old, rule.new);
      if (content !== before) {
        const count = (before.match(rule.old) || []).length;
        fileFixed += count;
        changes.push(`${rule.old.source.slice(0, 30)}... → ${rule.new} (${count})`);
      }
    }

    if (fileFixed > 0) {
      console.log(`${DRY_RUN ? '📝' : '✅'} ${relPath} (${fileFixed} chỗ)`);
      for (const c of changes) console.log(`   ${c}`);

      if (!DRY_RUN) {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      totalFixed += fileFixed;
      filesModified++;
    }
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`${DRY_RUN ? '📋' : '✅'} ${DRY_RUN ? 'Dry run' : 'Đã fix'}: ${totalFixed} chỗ trong ${filesModified} file`);
  console.log(`═══════════════════════════════════════════\n`);
}

main();

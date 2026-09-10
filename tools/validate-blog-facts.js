/**
 * validate-blog-facts.js — Verify blog content against vault facts (Single Source of Truth)
 *
 * Thay thế validate-blog-laws.js. Check:
 * 1. Abolished concepts (thuế khoán, lệ phí môn bài)
 * 2. Outdated values (500 triệu → 1 tỷ, 11 triệu → 15.5 triệu)
 * 3. CJK characters
 * 4. Frontmatter leak
 * 5. Old law references
 *
 * Usage: node tools/validate-blog-facts.js
 * Exit code: 0 = clean, 1 = issues found
 */

const fs = require('fs');
const path = require('path');

// ── Load facts ──
const FACTS_PATH = path.join(__dirname, 'blog-facts.json');
const facts = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf-8'));

// ── Old law patterns (from validate-blog-laws.js) ──
const OLD_LAWS = [
  { re: /Nghị định 125\/2020|NĐ\.?\s*125\/2020/g, name: 'NĐ 125/2020', new: 'NĐ 310/2025', sev: 'CRITICAL' },
  { re: /Nghị định 123\/2020|NĐ\.?\s*123\/2020/g, name: 'NĐ 123/2020', new: 'NĐ 254/2026', sev: 'HIGH' },
  { re: /Nghị định 126\/2020|NĐ\.?\s*126\/2020/g, name: 'NĐ 126/2020', new: 'NĐ 252/2026', sev: 'HIGH' },
  { re: /Luật 38\/2019/g, name: 'Luật 38/2019', new: 'Luật 108/2025', sev: 'HIGH' },
  { re: /Luật 04\/2007/g, name: 'Luật 04/2007', new: 'Luật 109/2025', sev: 'HIGH' },
  { re: /Luật 14\/2020/g, name: 'Luật 14/2020', new: 'Luật 67/2025', sev: 'MEDIUM' },
  { re: /Luật 59\/2020/g, name: 'Luật 59/2020', new: 'Luật 76/2025', sev: 'MEDIUM' },
  { re: /Thông tư 78\/2021|TT\.?\s*78\/2021/g, name: 'TT 78/2021', new: 'TT 91/2026', sev: 'MEDIUM' },
];

// ── CJK regex ──
const CJK_REGEX = /[一-鿿㐀-䶿豈-﫿]/g;

// ── Collect files ──
function collectFiles(dir) {
  const files = [];
  for (const item of fs.readdirSync(dir)) {
    const fp = path.join(dir, item);
    if (fs.statSync(fp).isDirectory()) files.push(...collectFiles(fp));
    else if (item.endsWith('.md')) files.push(fp);
  }
  return files;
}

// ── Check if pattern is in OK context ──
function isInOkContext(content, okPatterns) {
  if (!okPatterns || okPatterns.length === 0) return false;
  return okPatterns.some(p => new RegExp(p, 'i').test(content));
}

// ── Main ──
function main() {
  const blogDir = path.join(__dirname, 'blog-content');
  const files = collectFiles(blogDir);
  console.log(`\n🔍 Fact-checking ${files.length} blog posts against vault...\n`);

  let totalIssues = 0;
  const issuesByFile = {};

  for (const filePath of files) {
    const relPath = path.relative(blogDir, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Skip non-blog files (metadata, social media posts)
    if (relPath === 'internal-linking-map.md' || relPath === 'seo-metrics-checklist.md') continue;
    if (relPath.includes('post-hkd-phat-hd-dt')) continue; // social media post
    if (relPath.endsWith('.json')) continue;

    const fileIssues = [];

    // ── Extract published_at date from frontmatter ──
    const dateMatch = content.match(/published_at:\s*['"]?(\d{4}-\d{2}-\d{2})/);
    const publishedAt = dateMatch ? new Date(dateMatch[1]) : null;

    // ── Check 1: Abolished concepts ──
    for (const [key, fact] of Object.entries(facts.abolished)) {
      // Skip if blog was written BEFORE the fact became effective
      if (publishedAt && fact.effective_date) {
        const effective = new Date(fact.effective_date);
        if (publishedAt < effective) continue; // Bài viết đúng thời điểm
      }
      for (const bad of fact.bad_patterns) {
        if (content.includes(bad)) {
          if (!isInOkContext(content, fact.ok_patterns)) {
            fileIssues.push({
              type: 'ABOLISHED',
              severity: 'CRITICAL',
              note: `${fact.name} đã chấm dứt (${fact.source})`,
              detail: `Tìm thấy: "${bad}"${publishedAt ? ` (bài viết: ${dateMatch[1]})` : ''}`,
            });
            totalIssues++;
          }
        }
      }
    }

    // ── Check 2: Outdated values ──
    for (const [key, fact] of Object.entries(facts.outdated_values)) {
      // Skip if blog was written BEFORE the fact became effective
      if (publishedAt && fact.effective_date) {
        const effective = new Date(fact.effective_date);
        if (publishedAt < effective) continue; // Bài viết đúng thời điểm
      }
      for (const bad of fact.bad_patterns) {
        if (content.includes(bad)) {
          if (!isInOkContext(content, fact.ok_patterns)) {
            fileIssues.push({
              type: 'OUTDATED',
              severity: 'HIGH',
              note: `${fact.name}: ${fact.old_value} → ${fact.correct_value} (${fact.source})`,
              detail: `Tìm thấy: "${bad}"${publishedAt ? ` (bài viết: ${dateMatch[1]})` : ''}`,
            });
            totalIssues++;
          }
        }
      }
    }

    // ── Check 3: Old laws ──
    for (const law of OLD_LAWS) {
      const matches = content.match(law.re);
      if (matches) {
        // Skip if in "thay thế" context
        let realCount = 0;
        for (const m of matches) {
          const idx = content.indexOf(m);
          const ctx = content.substring(Math.max(0, idx - 50), Math.min(content.length, idx + m.length + 50));
          if (!/thay thế|thay the|sửa đổi|thay cho/i.test(ctx)) {
            realCount++;
          }
        }
        if (realCount > 0) {
          fileIssues.push({
            type: 'OLD_LAW',
            severity: law.sev,
            note: `${law.name} → ${law.new}`,
            detail: `${realCount} chỗ (không phải "thay thế")`,
          });
          totalIssues += realCount;
        }
      }
    }

    // ── Check 4: CJK ──
    const cjk = content.match(CJK_REGEX);
    if (cjk) {
      fileIssues.push({
        type: 'CJK',
        severity: 'HIGH',
        note: `${cjk.length} ký tự tiếng Trung/Nhật/Hàn`,
        detail: cjk.slice(0, 5).join(''),
      });
      totalIssues += cjk.length;
    }

    // ── Check 5: Frontmatter leak ──
    const parsed = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    if (parsed && parsed[1].trimStart().startsWith('---')) {
      fileIssues.push({
        type: 'FRONTMATTER',
        severity: 'CRITICAL',
        note: 'Content chứa frontmatter thừa',
        detail: 'Content sau frontmatter vẫn bắt đầu bằng ---',
      });
      totalIssues++;
    }

    if (fileIssues.length > 0) {
      issuesByFile[relPath] = fileIssues;
    }
  }

  // ── Output ──
  if (totalIssues === 0) {
    console.log('✅ ALL CLEAN — Vault facts verified. No issues found.\n');
    process.exit(0);
  }

  const critical = Object.values(issuesByFile).flat().filter(i => i.severity === 'CRITICAL').length;
  const high = Object.values(issuesByFile).flat().filter(i => i.severity === 'HIGH').length;

  console.log(`❌ ${totalIssues} issues in ${Object.keys(issuesByFile).length} files:\n`);
  if (critical) console.log(`   🔴 CRITICAL: ${critical}`);
  if (high) console.log(`   🟠 HIGH: ${high}\n`);

  for (const [file, issues] of Object.entries(issuesByFile)) {
    console.log(`📄 ${file}`);
    for (const iss of issues) {
      const icon = iss.severity === 'CRITICAL' ? '🔴' : '🟡';
      console.log(`   ${icon} [${iss.type}] ${iss.note}`);
      console.log(`      ${iss.detail}`);
    }
    console.log('');
  }

  console.log(`═══════════════════════════════════`);
  console.log(`📊 ${totalIssues} issues / ${files.length} files`);
  console.log(`═══════════════════════════════════\n`);

  process.exit(1);
}

main();

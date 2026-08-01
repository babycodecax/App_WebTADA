/* ==========================================================================
   citations.ts — Legal citation enrichment (Phase 4)
   Port từ Python src/knowledge/citation_enrichment.py
   Không cần SQLite FTS5 — lookup từ JSON refs.
   ========================================================================== */

import { AuditReport } from './schemas';

// CITATION_REFS: mapping group/code prefix → [(doc_code, article_no)]
const CITATION_REFS: Record<string, Array<{ doc: string; article: string; title: string }>> = {
  'BS_': [
    { doc: 'TT99/2025', article: '5', title: 'Bảng cân đối kế toán' },
    { doc: 'TT_200_2014', article: '112', title: 'Hướng dẫn lập Bảng CĐKT' },
  ],
  'PL_': [
    { doc: 'TT99/2025', article: '6', title: 'Báo cáo KQKD' },
    { doc: 'TT_200_2014', article: '113', title: 'Hướng dẫn lập Báo cáo KQKD' },
  ],
  'CF_': [
    { doc: 'TT99/2025', article: '7', title: 'Báo cáo LCTT' },
    { doc: 'TT_200_2014', article: '114', title: 'Hướng dẫn lập Báo cáo LCTT' },
  ],
  'SF_001': [
    { doc: 'TT99/2025', article: '17', title: 'Hệ thống BCTC' },
    { doc: 'TT_200_2014', article: '112', title: 'Hướng dẫn lập Bảng CĐKT' },
  ],
  'XV_008': [
    { doc: 'TT_200_2014', article: '114', title: 'Hướng dẫn lập B03' },
  ],
  'XV_009': [],
  'XV_010': [
    { doc: 'TT_200_2014', article: '115', title: 'Thuyết minh BCTC' },
  ],
  'XV_011': [
    { doc: 'TT_200_2014', article: '112', title: 'Hướng dẫn lập B01' },
  ],
  'XV_012': [
    { doc: 'TT_200_2014', article: '112', title: 'Hướng dẫn lập B01' },
  ],
  'LV3_001': [
    { doc: 'TT99/2025', article: '17', title: 'Hệ thống BCTC' },
    { doc: 'TT_200_2014', article: '112', title: 'Hướng dẫn lập B01' },
  ],
  'AP_': [
    { doc: 'VAS 01', article: '', title: 'Chuẩn mực kế toán số 01 - Khung' },
    { doc: 'TT99/2025', article: '15', title: 'Nguyên tắc kế toán' },
  ],
  'VAT_': [
    { doc: 'Luật 106/2016/QH13', article: '1', title: 'Thuế GTGT' },
  ],
  'KLT_001': [
    { doc: 'VSA 200', article: '', title: 'Mục tiêu và nguyên tắc cơ bản kiểm toán' },
  ],
  'KLT_002': [
    { doc: 'VSA 200', article: '', title: 'Mục tiêu và nguyên tắc cơ bản kiểm toán' },
  ],
  'KLT_003': [
    { doc: 'TT99/2025', article: '24', title: 'Không đáp ứng giả định hoạt động liên tục' },
  ],
  'AP_030': [
    { doc: 'TT200', article: '112', title: 'Phân loại TSNH/TSDH' },
    { doc: 'TT99/2025', article: '20', title: 'Nguyên tắc lập và trình bày BCTC' },
  ],
};

/** Format citation as string */
function formatCitation(ref: { doc: string; article: string; title: string }): string {
  const parts: string[] = [];
  if (ref.doc) parts.push(ref.doc);
  if (ref.article) parts.push(`Điều ${ref.article}`);
  if (ref.title) parts.push(`(${ref.title})`);
  return parts.join(' ');
}

/**
 * Enrich legal citations cho violations.
 * Tìm ref theo code prefix (VD: 'BS_001' match 'BS_')
 */
export function enrichCitations(report: AuditReport): void {
  for (const violation of report.violations) {
    // Check exact code first
    if (CITATION_REFS[violation.code]) {
      const refs = CITATION_REFS[violation.code];
      if (refs.length > 0) {
        violation.legalCitations = refs.map(formatCitation);
      }
      continue;
    }

    // Check prefix match
    const prefix = Object.keys(CITATION_REFS).find(k =>
      k.endsWith('_') && violation.code.startsWith(k)
    );
    if (prefix) {
      const refs = CITATION_REFS[prefix];
      if (refs.length > 0) {
        violation.legalCitations = refs.map(formatCitation);
      }
    }
  }
}

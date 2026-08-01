import { NextRequest, NextResponse } from 'next/server';
import { parseBCTCWithCompany, detectPeriod } from '@/lib/audit/parser';
import { parseLedgerFromWorkbook } from '@/lib/audit/ledgerParser';
import { parseDocxBCTC, isDocx } from '@/lib/audit/docxParser';
import { runAudit } from '@/lib/audit/engine';
import { reportBySeverity } from '@/lib/audit/schemas';
import { generateHtmlReport } from '@/lib/audit/reporter';
import { generateDocxBuffer } from '@/lib/audit/wordGenerator';
import { setCachedResult, CachedResult } from '@/lib/audit/cache';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Lưu lịch sử audit vào Supabase (best-effort, không crash) */
async function saveAuditHistory(result: CachedResult, userEmail?: string): Promise<void> {
  try {
    await getSupabase().from('audit_history').insert({
      audit_id: result.audit_id,
      company_name: result.company_name,
      period: result.period,
      total_violations: result.total_violations,
      by_severity: result.by_severity,
      file_name: result.file_name,
      user_email: userEmail || null,
      ran_at: new Date(result.ran_at * 1000).toISOString(),
    });
  } catch (e) {
    // Lưu history thất bại không ảnh hưởng kết quả
  }
}

// ─── Rate limiting (in-memory, per IP) ───
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 }; // 10 requests/giờ/IP
const _rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT.max;
}

export async function POST(req: NextRequest) {
  try {
    // Bắt buộc đăng nhập — verify Supabase JWT
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Cần đăng nhập để sử dụng Rà soát BCTC' }, { status: 401 });
    }
    const token = auth.slice(7);
    const { data: userData, error: userError } = await getSupabase().auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return NextResponse.json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' }, { status: 401 });
    }

    // Rate limit by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 1 giờ.' },
        { status: 429 },
      );
    }

    if (!req.body) {
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    // Validate extension — hỗ trợ .xlsx, .xls, .docx
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!['xlsx', 'xls', 'docx'].includes(ext)) {
      return NextResponse.json(
        { error: 'Chỉ hỗ trợ file .xlsx, .xls hoặc .docx' },
        { status: 400 },
      );
    }

    // Validate file size (20 MB)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 20 MB.` },
        { status: 400 },
      );
    }

    // Đọc file buffer
    const buffer = await file.arrayBuffer();

    // Parse theo loại file: Excel (.xlsx/.xls) hoặc Word (.docx)
    let stmt: any;
    let extractedName = '';
    let extractedTax = '';
    let ledgerResult: any = null;

    if (ext === 'docx') {
      stmt = parseDocxBCTC(buffer);
      extractedName = file.name.replace(/\.docx$/i, '');
    } else {
      const parsed = parseBCTCWithCompany(buffer);
      stmt = parsed.statements;
      extractedName = parsed.companyName;
      extractedTax = parsed.taxCode;

      // Parse CĐPS (ledger + cdps) từ cùng workbook
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
      ledgerResult = parseLedgerFromWorkbook(workbook);
    }

    // Detect period
    const period = detectPeriod(file.name, stmt);

    // Chạy audit engine
    const companyName = extractedName || file.name;
    const taxCode = extractedTax || '';
    const report = runAudit({
      reportedStatements: stmt,
      ledgerData: ledgerResult?.ledgerData,
      cdpsData: ledgerResult?.cdpsData,
      companyName,
      taxCode,
      period,
    });

    // Build response
    const bySeverity = reportBySeverity(report);
    const violationsJson = report.violations.map(v => ({
      code: v.code,
      group: v.group,
      severity: v.severity,
      description: v.description,
      expected: v.expected,
      actual: v.actual,
      difference: v.difference,
      affected_accounts: v.affectedAccounts,
      affected_periods: v.affectedPeriods,
      explanation: v.explanation,
      recommendation: v.recommendation,
      legal_citations: v.legalCitations,
      professional_basis: v.professionalBasis,
      proposed_journal_entry: v.proposedJournalEntry,
    }));

    // Generate HTML report with BCTC data for sections B, C
    const bctcData = {
      balanceSheetItems: stmt.balanceSheet,
      incomeStatementItems: stmt.incomeStatement,
      cashflowItems: stmt.cashflow,
    };
    const htmlReport = generateHtmlReport(report, bctcData);
    // Sinh .docx thật (Word mở 100%)
    let docxBase64 = '';
    try {
      const docxBuffer = await generateDocxBuffer(report, bctcData);
      docxBase64 = docxBuffer.toString('base64');
    } catch (e) {
      console.error('Docx generation error:', e);
    }

    const fileName = `BaoCao_SoatXet_BCTC_${(report.companyName || 'DoanhNghiep').replace(/[^\p{L}\p{N}]+/gu, '_').substring(0, 60)}_${report.period}.pdf`;

    const result: CachedResult = {
      success: true,
      audit_id: report.auditId,
      company_name: report.companyName || '(từ file)',
      period: report.period,
      total_violations: report.violations.length,
      by_severity: bySeverity,
      violations: violationsJson,
      html_report: htmlReport,
      word_report: docxBase64,
      word_format: 'docx',
      file_name: fileName,
      ran_at: Math.floor(Date.now() / 1000),
    };

    // Cache
    setCachedResult(result);
    await saveAuditHistory(result, userData.user.email);

    return NextResponse.json(result, {
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Audit engine error:', msg);
    return NextResponse.json(
      { success: false, error: `Lỗi xử lý audit: ${msg}` },
      { status: 500 },
    );
  }
}

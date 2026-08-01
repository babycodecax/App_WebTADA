/* ==========================================================================
   schemas.ts — TS interfaces cho Audit BCTC Engine
   Port từ Python (src/schemas/):
     - financial_statements.py
     - reported_statements.py
     - violations.py
     - financial_ratios.py
     - cdps_data.py, ketchuyen_data.py, vat_invoice.py, risk_report.py
   ========================================================================== */

// ─── Helpers ───
export function normCode(raw: string): string {
  const s = String(raw).trim();
  if (s && /^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

// ─── Bảng CĐKT (B01) ───
export interface BalanceSheet {
  assetsOpening: Record<string, number>;
  assetsClosing: Record<string, number>;
  liabilitiesOpening: Record<string, number>;
  liabilitiesClosing: Record<string, number>;
  equityOpening: Record<string, number>;
  equityClosing: Record<string, number>;
}

export function totalAssetsOpening(bs: BalanceSheet): number {
  return Object.values(bs.assetsOpening).reduce((a, b) => a + b, 0);
}
export function totalAssetsClosing(bs: BalanceSheet): number {
  return Object.values(bs.assetsClosing).reduce((a, b) => a + b, 0);
}
export function totalLiabilitiesClosing(bs: BalanceSheet): number {
  return Object.values(bs.liabilitiesClosing).reduce((a, b) => a + b, 0);
}
export function totalEquityClosing(bs: BalanceSheet): number {
  return Object.values(bs.equityClosing).reduce((a, b) => a + b, 0);
}
export function totalLiabilitiesEquityClosing(bs: BalanceSheet): number {
  return totalLiabilitiesClosing(bs) + totalEquityClosing(bs);
}

// ─── KQKD (B02) ───
export interface IncomeStatement {
  revenue: number;
  costOfGoodsSold: number;
  sellingExpenses: number;
  adminExpenses: number;
  financialRevenue: number;
  financialExpenses: number;
  citExpense: number;
  profitBeforeTax: number | null;
  profitAfterTax: number;
}

export function totalExpenses(pl: IncomeStatement): number {
  return pl.costOfGoodsSold + pl.sellingExpenses + pl.adminExpenses + pl.financialExpenses + pl.citExpense;
}

// ─── LCTT (B03) ───
export interface CashflowStatement {
  cashOpening: number;
  cashClosing: number;
  netCashFromOperating: number;
  netCashFromInvesting: number;
  netCashFromFinancing: number;
}

// ─── Sổ cái / CĐPS ───
export interface LedgerData {
  balances: Record<string, number>;
  openingBalances: Record<string, number>;
  postings: Record<string, { no: number; co: number }>;
  openingDebit: Record<string, number>;
  openingCredit: Record<string, number>;
  closingDebit: Record<string, number>;
  closingCredit: Record<string, number>;
}

export function getLedgerBalance(ld: LedgerData, account: string): number {
  return ld.balances[account] ?? 0;
}
export function getLedgerPosting(ld: LedgerData, account: string, side: 'no' | 'co'): number {
  return ld.postings[account]?.[side] ?? 0;
}
export function cashAccountTotal(ld: LedgerData): number {
  return (ld.balances['111'] ?? 0) + (ld.balances['112'] ?? 0) + (ld.balances['113'] ?? 0);
}
export function getCreditBalance(ld: LedgerData, account: string): number {
  const bal = getLedgerBalance(ld, account);
  return bal < 0 ? Math.abs(bal) : 0;
}
export function getDebitBalance(ld: LedgerData, account: string): number {
  const bal = getLedgerBalance(ld, account);
  return bal > 0 ? bal : 0;
}

// ─── BCTC ĐÃ LẬP (Reported — read from Excel) ───
export interface ReportedLineItem {
  code: string;
  rawCode?: string;
  label: string;
  section?: string;
  formula?: string;
  formulaComponents: Array<[string, number]>; // [mã số, dấu (+1/-1)]
  closing: number | null;
  opening: number | null;
}

export interface ReportedStatementSet {
  balanceSheet: Record<string, ReportedLineItem>;
  incomeStatement: Record<string, ReportedLineItem>;
  cashflow: Record<string, ReportedLineItem>;
  notes: Record<string, ReportedLineItem>;
}

export function getBS(rss: ReportedStatementSet, code: string): ReportedLineItem | undefined {
  return rss.balanceSheet[normCode(code)];
}
export function getPL(rss: ReportedStatementSet, code: string): ReportedLineItem | undefined {
  return rss.incomeStatement[normCode(code)];
}
export function getCF(rss: ReportedStatementSet, code: string): ReportedLineItem | undefined {
  return rss.cashflow[normCode(code)];
}

export function totalReportedAssets(rss: ReportedStatementSet): number | null {
  const a = rss.balanceSheet['100'];
  const b = rss.balanceSheet['200'];
  if (!a || !b) return null;
  return (a.closing ?? 0) + (b.closing ?? 0);
}

export function getAllFormulaItems(rss: ReportedStatementSet): ReportedLineItem[] {
  const items: ReportedLineItem[] = [];
  for (const store of [rss.balanceSheet, rss.incomeStatement, rss.cashflow]) {
    for (const item of Object.values(store)) {
      if (item.formulaComponents.length > 0) items.push(item);
    }
  }
  return items;
}

// ─── Violation ───
export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ViolationGroup =
  | 'formula' | 'cross_validation' | 'cashflow' | 'principles' | 'anomaly'
  | 'statement_formula' | 'statement_cross_validation' | 'statement_template'
  | 'statement_consistency' | 'ratio_catalog' | 'vat' | 'going_concern';

export interface Violation {
  code: string;
  group: ViolationGroup;
  severity: ViolationSeverity;
  description: string;
  expected: number | null;
  actual: number | null;
  difference: number | null;
  affectedAccounts: string[];
  affectedPeriods: string[];
  explanation?: string;
  recommendation?: string;
  confidenceScore: number;
  proposedJournalEntry?: string;
  legalCitations?: string[];
  professionalBasis?: string[];
}

// ─── AuditReport ───
export interface AuditReport {
  auditId: string;
  companyName?: string;
  taxCode?: string;
  period: string;
  violations: Violation[];
}

export function reportBySeverity(report: AuditReport): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of report.violations) {
    counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  }
  return counts;
}

export function reportByGroup(report: AuditReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of report.violations) {
    counts[v.group] = (counts[v.group] ?? 0) + 1;
  }
  return counts;
}

export function hasCritical(report: AuditReport): boolean {
  return report.violations.some(v => v.severity === 'critical');
}

// ─── CDPS Data (Bảng cân đối phát sinh) ───
export interface CdpsData {
  rows: CdpsRow[];
}

export interface CdpsRow {
  account: string;       // mã TK
  label: string;         // tên TK
  openingDebit: number;
  openingCredit: number;
  postingDebit: number;
  postingCredit: number;
  closingDebit: number;
  closingCredit: number;
}

// ─── Kết chuyển ───
export interface KetchuyenData {
  entries: KetchuyenEntry[];
}

export interface KetchuyenEntry {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description?: string;
}

// ─── VAT ───
export interface VatInvoiceSet {
  invoices: VatInvoice[];
}

export interface VatInvoice {
  invoiceNo: string;
  date: string;
  totalAmount: number;
  vatAmount: number;
  vatRate: number;
  type: 'input' | 'output';
}

// ─── Financial Ratios ───
export interface FinancialRatioSet {
  ratios: Record<string, number>;
  thresholds: Record<string, { min: number; max: number }>;
}

// ─── Default factories ───
export function emptyBalanceSheet(): BalanceSheet {
  return {
    assetsOpening: {}, assetsClosing: {},
    liabilitiesOpening: {}, liabilitiesClosing: {},
    equityOpening: {}, equityClosing: {},
  };
}

export function emptyIncomeStatement(): IncomeStatement {
  return {
    revenue: 0, costOfGoodsSold: 0, sellingExpenses: 0, adminExpenses: 0,
    financialRevenue: 0, financialExpenses: 0, citExpense: 0,
    profitBeforeTax: null, profitAfterTax: 0,
  };
}

export function emptyCashflowStatement(): CashflowStatement {
  return { cashOpening: 0, cashClosing: 0, netCashFromOperating: 0, netCashFromInvesting: 0, netCashFromFinancing: 0 };
}

export function emptyLedgerData(): LedgerData {
  return {
    balances: {}, openingBalances: {}, postings: {},
    openingDebit: {}, openingCredit: {}, closingDebit: {}, closingCredit: {},
  };
}

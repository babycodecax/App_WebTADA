/* ==========================================================================
   engine.ts — Audit Engine Orchestrator
   Port từ Python src/engine/rule_engine.py + pipeline.py
   Chạy tất cả rules trên dữ liệu đã parse, trả về AuditReport
   ========================================================================== */

import {
  AuditReport,
  BalanceSheet,
  IncomeStatement,
  CashflowStatement,
  LedgerData,
  ReportedStatementSet,
  CdpsData,
  FinancialRatioSet,
  VatInvoiceSet,
  KetchuyenData,
} from './schemas';

import crypto from 'crypto';
import { runAllFormulaRules } from './rules/formula';
import { checkReportedFormulas } from './rules/statementFormula';
import { runAllCrossValidationRules, runStatementCrossValidation } from './rules/crossValidation';
import { runAllPrincipleRules } from './rules/principles';
import { runStatementRatioAnalysis } from './rules/anomaly';
import { runStatementConsistency } from './rules/consistency';
import { runStatementTemplateValidation } from './rules/template';
import { checkDuplicateCodes, checkReferenceFormulas, checkNotesMandatoryCodes, checkTemplateConsistency, checkTemplateMismatch } from './rules/template';
import { runStatementTrend } from './rules/trend';
import { runGoingConcernRules } from './rules/goingConcern';
import { runCdpsAuditRules } from './rules/cdps';
import { runVatAudit } from './rules/vat';
import { runAllKetchuyenRules } from './rules/ketchuyen';
import { evaluateRatioCatalog } from './rules/ratio';
import { enrichCitations } from './citations';
import { generateExplanations } from './explanations';

export interface AuditOptions {
  balanceSheet?: BalanceSheet;
  incomeStatement?: IncomeStatement;
  cashflowStatement?: CashflowStatement;
  ledgerData?: LedgerData;
  reportedStatements?: ReportedStatementSet;
  cdpsData?: CdpsData;
  ketchuyenData?: KetchuyenData;
  financialRatios?: FinancialRatioSet;
  vatInvoices?: VatInvoiceSet;
  notesCash?: number;
  notesCashOpen?: number;
  auditId?: string;
  companyName?: string;
  taxCode?: string;
  period?: string;
}

/**
 * Chạy toàn bộ audit engine.
 * Trả về AuditReport với violations.
 *
 * Hai luồng đầu vào độc lập:
 * - Luồng A (theo TK): balanceSheet/incomeStatement/cashflowStatement/ledgerData
 * - Luồng B (theo Mã số BCTC): reportedStatements
 */
export function runAudit(options: AuditOptions): AuditReport {
  const {
    balanceSheet,
    incomeStatement,
    cashflowStatement,
    ledgerData,
    reportedStatements,
    cdpsData,
    ketchuyenData,
    financialRatios,
    vatInvoices,
    notesCash,
    notesCashOpen,
    auditId = `audit_${crypto.randomUUID().slice(0, 12)}`,
    companyName,
    taxCode,
    period = '2024',
  } = options;

  const violations: AuditReport['violations'] = [];
  const emptyPl: IncomeStatement = { revenue: 0, costOfGoodsSold: 0, sellingExpenses: 0, adminExpenses: 0, financialRevenue: 0, financialExpenses: 0, citExpense: 0, profitBeforeTax: null, profitAfterTax: 0 };
  const emptyCf: CashflowStatement = { cashOpening: 0, cashClosing: 0, netCashFromOperating: 0, netCashFromInvesting: 0, netCashFromFinancing: 0 };

  // ─── Luồng A: Formula checks ───
  if (balanceSheet) {
    violations.push(
      ...runAllFormulaRules(
        balanceSheet,
        incomeStatement || emptyPl,
        cashflowStatement || emptyCf,
      ),
    );
  }

  // ─── Cross-validation (BCTC vs Sổ cái) ───
  if (balanceSheet && ledgerData) {
    violations.push(
      ...runAllCrossValidationRules(balanceSheet, ledgerData, incomeStatement || undefined),
    );
  }

  // ─── Accounting Principles ───
  if (ledgerData || reportedStatements) {
    violations.push(
      ...runAllPrincipleRules(ledgerData || null, reportedStatements || null),
    );
  }

  // ─── Luồng B: BCTC đã lập ───
  if (reportedStatements) {
    // Lớp 1: SF_001 - công thức nhúng
    violations.push(...checkReportedFormulas(reportedStatements));

    // Lớp 2: XV_008-010 - đối chiếu chéo B01↔B02↔B03
    violations.push(
      ...runStatementCrossValidation(reportedStatements, notesCash, notesCashOpen, cdpsData),
    );

    // Lớp 3: LV3 - template validation (3 báo cáo) + mã trùng + thuyết minh + tham chiếu
    for (const rt of ['balance_sheet', 'income_statement', 'cashflow']) {
      violations.push(...runStatementTemplateValidation(reportedStatements, rt));
      violations.push(...checkReferenceFormulas(reportedStatements, rt));
    }
    violations.push(...checkDuplicateCodes(reportedStatements));
    violations.push(...checkNotesMandatoryCodes(reportedStatements));
    violations.push(...checkTemplateConsistency(reportedStatements));
    violations.push(...checkTemplateMismatch(reportedStatements));

    // Lớp 4: ratio analysis (AN_101-104)
    violations.push(...runStatementRatioAnalysis(reportedStatements));

    // Lớp 5: consistency (AN_105-106)
    violations.push(...runStatementConsistency(reportedStatements));

    // Lớp 7: trend (AN_201+)
    violations.push(...runStatementTrend(reportedStatements));

    // Lớp 8: going concern (KLT_001-002)
    violations.push(...runGoingConcernRules(reportedStatements));

    // XV_015: Doanh thu CĐPS vs B02
    if (ledgerData) {
      violations.push(...runAllCrossValidationRules(
        balanceSheet || { assetsOpening: {}, assetsClosing: {}, liabilitiesOpening: {}, liabilitiesClosing: {}, equityOpening: {}, equityClosing: {} },
        ledgerData,
        incomeStatement || undefined,
      ));
    }
  }

  // ─── Luồng C: CDPS ───
  if (cdpsData) {
    violations.push(...runCdpsAuditRules(cdpsData, reportedStatements));
  }

  // ─── Luồng D: Kết chuyển ───
  violations.push(...runAllKetchuyenRules(cdpsData));

  // ─── Luồng E: VAT ───
  if (vatInvoices) {
    violations.push(...runVatAudit(vatInvoices));
  }

  // ─── Ratio catalog ───
  if (financialRatios) {
    violations.push(...evaluateRatioCatalog(financialRatios));
  }

  // ─── Enrich citations + explanations ───
  const report: AuditReport = {
    auditId,
    companyName,
    taxCode,
    period,
    violations,
  };

  // Enrich citations + explanations
  enrichCitations(report);
  generateExplanations(report);

  return report;
}

/* ==========================================================================
   vat.ts — VAT rules (thuế GTGT)
   Port từ Python src/rules/vat_rules.py
   ========================================================================== */

import { Violation, VatInvoiceSet } from '../schemas';

/**
 * VAT_001: Hóa đơn đầu vào có thuế suất 0%
 */
export function checkVatRateZero(invoices: VatInvoiceSet): Violation[] {
  const violations: Violation[] = [];
  for (const inv of invoices.invoices) {
    if (inv.type === 'input' && inv.vatRate === 0 && inv.vatAmount > 0) {
      violations.push({
        code: 'VAT_001', group: 'vat', severity: 'medium',
        description: `Hóa đơn ${inv.invoiceNo}: thuế suất 0% nhưng có số thuế ${inv.vatAmount.toLocaleString('vi-VN')}.`,
        expected: 0, actual: inv.vatAmount, difference: inv.vatAmount,
        affectedAccounts: ['133'], affectedPeriods: [], confidenceScore: 1.0,
      });
    }
  }
  return violations;
}

/**
 * VAT_002: Hóa đơn đầu ra không có thuế GTGT
 */
export function checkOutputMissingVat(invoices: VatInvoiceSet): Violation[] {
  const violations: Violation[] = [];
  for (const inv of invoices.invoices) {
    if (inv.type === 'output' && inv.vatAmount === 0 && inv.totalAmount > 0) {
      violations.push({
        code: 'VAT_002', group: 'vat', severity: 'high',
        description: `Hóa đơn ${inv.invoiceNo}: không có thuế GTGT đầu ra.`,
        expected: null, actual: null, difference: null,
        affectedAccounts: ['3331'], affectedPeriods: [], confidenceScore: 0.8,
      });
    }
  }
  return violations;
}

export function runVatAudit(invoices: VatInvoiceSet): Violation[] {
  return [
    ...checkVatRateZero(invoices),
    ...checkOutputMissingVat(invoices),
  ];
}

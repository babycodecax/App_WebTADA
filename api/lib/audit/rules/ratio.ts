/* ==========================================================================
   ratio.ts — RC_*: Financial ratio catalog evaluation
   Port từ Python src/rules/ratio_catalog_rules.py
   ========================================================================== */

import { Violation, FinancialRatioSet } from '../schemas';

/**
 * Evaluate ratio catalog thresholds.
 * Mỗi ratio có min/max threshold; vi phạm → RC_{ratio_code}
 */
/**
 * Evaluate ratio catalog thresholds from FinancialRatioSet (AN_111-117)
 */
import { evaluateRatiosFromSet as evaluateAnomalyRatios } from './anomaly';
export { evaluateAnomalyRatios as evaluateRatiosFromSet };

export function evaluateRatioCatalog(ratios: FinancialRatioSet): Violation[] {
  const violations: Violation[] = [];
  for (const [code, value] of Object.entries(ratios.ratios)) {
    const threshold = ratios.thresholds[code];
    if (!threshold) continue;
    if (value < threshold.min || value > threshold.max) {
      violations.push({
        code: `RC_${code}`,
        group: 'ratio_catalog',
        severity: 'medium',
        description: `Chỉ số ${code} = ${value.toFixed(2)} ngoài ngưỡng [${threshold.min}, ${threshold.max}].`,
        expected: null, actual: value, difference: null,
        affectedAccounts: [], affectedPeriods: [],
        confidenceScore: 0.7,
      });
    }
  }
  return violations;
}

/**
 * Customers landing FilterBar chips ↔ V4 table `filter_preset` (+ KPI selection).
 *
 * Status chips map to purchase-activity presets (Active / Dormant) or account flag (Inactive).
 * Outstanding chips map to receivable posture on `metrics_buyer_now_summary`.
 * Buyer App chips map to `buyers.buyer_app_enabled`.
 */

export type CustomersStatusFilter = 'active' | 'dormant' | 'inactive';
export type CustomersOutstandingFilter = 'due' | 'overdue';
export type CustomersBuyerAppFilter = 'enabled' | 'disabled';

export interface CustomersLandingFilterChips {
  status: CustomersStatusFilter[];
  outstanding: CustomersOutstandingFilter[];
  buyer_app: CustomersBuyerAppFilter[];
}

export const EMPTY_CUSTOMERS_FILTER_CHIPS: CustomersLandingFilterChips = {
  status: [],
  outstanding: [],
  buyer_app: [],
};

/** KPI card id → chip selection shown in the FilterBar. */
export function chipsFromKpiId(kpiId: string | null | undefined): CustomersLandingFilterChips {
  switch (kpiId) {
    case 'active_customers':
      return { ...EMPTY_CUSTOMERS_FILTER_CHIPS, status: ['active'] };
    case 'dormant_customers':
      return { ...EMPTY_CUSTOMERS_FILTER_CHIPS, status: ['dormant'] };
    case 'overdue_receivables':
      // Overdue receivables KPI → Outstanding=Overdue (matches server preset `{ overdue: true }`)
      return { ...EMPTY_CUSTOMERS_FILTER_CHIPS, outstanding: ['overdue'] };
    case 'top80_customers':
      return { ...EMPTY_CUSTOMERS_FILTER_CHIPS, status: ['active'] };
    default:
      return { ...EMPTY_CUSTOMERS_FILTER_CHIPS };
  }
}

/**
 * Build the API `filter_preset` from FilterBar chips (+ optional top80 cutoff from KPI).
 * Single-select groups: at most one value per group is expected.
 */
export function buildCustomersFilterPreset(
  chips: CustomersLandingFilterChips,
  options?: { top80?: boolean },
): Record<string, unknown> | null {
  const status = chips.status[0];
  const outstanding = chips.outstanding[0];
  const buyerApp = chips.buyer_app[0];
  const preset: Record<string, unknown> = {};

  if (status === 'active') {
    preset.purchased_gte = 1;
    preset.period = 'this_quarter';
  } else if (status === 'dormant') {
    preset.dormant_period = 'this_quarter';
  } else if (status === 'inactive') {
    preset.is_active = false;
  }

  if (outstanding === 'due') {
    preset.receivable_gt = 0;
  } else if (outstanding === 'overdue') {
    preset.overdue = true;
  }

  if (buyerApp === 'enabled') {
    preset.buyer_app_enabled = true;
  } else if (buyerApp === 'disabled') {
    preset.buyer_app_enabled = false;
  }

  if (options?.top80) {
    preset.cutoff = 'top80';
    preset.sort = 'invoice_value_desc';
    // Top-80 is a subset of purchasers this quarter
    if (!status) {
      preset.purchased_gte = 1;
      preset.period = 'this_quarter';
    }
  }

  return Object.keys(preset).length > 0 ? preset : null;
}

/** Reverse-map a stored preset into chips (best-effort for route restore / KPI highlight). */
export function chipsFromFilterPreset(
  preset: Record<string, unknown> | null | undefined,
): CustomersLandingFilterChips {
  if (!preset || typeof preset !== 'object') return { ...EMPTY_CUSTOMERS_FILTER_CHIPS };

  const status: CustomersStatusFilter[] = [];
  if (preset.dormant_period != null) status.push('dormant');
  else if (preset.is_active === false) status.push('inactive');
  else if (typeof preset.purchased_gte === 'number' && preset.purchased_gte >= 1) status.push('active');

  const outstanding: CustomersOutstandingFilter[] = [];
  if (preset.overdue === true) outstanding.push('overdue');
  else if (preset.receivable_gt != null) outstanding.push('due');

  const buyer_app: CustomersBuyerAppFilter[] = [];
  if (preset.buyer_app_enabled === true) buyer_app.push('enabled');
  else if (preset.buyer_app_enabled === false) buyer_app.push('disabled');

  return { status, outstanding, buyer_app };
}

/** Which KPI (if any) matches the current chip selection. */
export function kpiIdFromChips(
  chips: CustomersLandingFilterChips,
  filterPreset: Record<string, unknown> | null,
): string | null {
  const isTop80 = filterPreset?.cutoff === 'top80';
  if (isTop80 && chips.status[0] === 'active' && chips.outstanding.length === 0 && chips.buyer_app.length === 0) {
    return 'top80_customers';
  }
  if (chips.status[0] === 'active' && chips.outstanding.length === 0 && chips.buyer_app.length === 0 && !isTop80) {
    return 'active_customers';
  }
  if (chips.status[0] === 'dormant' && chips.outstanding.length === 0 && chips.buyer_app.length === 0) {
    return 'dormant_customers';
  }
  if (chips.outstanding[0] === 'overdue' && chips.status.length === 0 && chips.buyer_app.length === 0) {
    return 'overdue_receivables';
  }
  return null;
}

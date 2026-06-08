'use client';

import type { DocTimelineStep, DocTimelineStepState } from './DocStatusTimeline';

import type { EstimateViewBandStatus, InvoiceViewBandStatus, SalesOrderViewBandStatus } from './doc-status-types';

export interface JourneyStripModel {
  steps: string[];
  activeIndex: number;
  allComplete?: boolean;
  variant?: 'default' | 'danger' | 'neutral';
}

function stepStateForIndex(
  model: JourneyStripModel,
  index: number,
): { state: DocTimelineStepState; terminalTone?: 'danger' | 'neutral' } {
  const { activeIndex, allComplete, variant } = model;
  if (allComplete) {
    return { state: 'complete' };
  }
  if (index < activeIndex) {
    return { state: 'complete' };
  }
  if (index > activeIndex) {
    return { state: 'pending' };
  }
  // index === activeIndex
  if (variant === 'danger' || variant === 'neutral') {
    return { state: 'terminal', terminalTone: variant };
  }
  return { state: 'current' };
}

export function estimateJourneyModel(band: EstimateViewBandStatus): JourneyStripModel {
  const main = ['Draft', 'Sent', 'Sales order'] as const;

  if (band === 'void') {
    return { steps: [...main.slice(0, 2), 'Void'], activeIndex: 2, variant: 'neutral' };
  }
  if (band === 'declined') {
    return { steps: [...main.slice(0, 2), 'Declined'], activeIndex: 2, variant: 'danger' };
  }
  if (band === 'expired') {
    return { steps: [...main.slice(0, 2), 'Expired'], activeIndex: 2, variant: 'danger' };
  }
  if (band === 'converted' || band === 'invoiced') {
    return { steps: [...main], activeIndex: 2, allComplete: true };
  }
  if (band === 'draft') {
    return { steps: [...main], activeIndex: 0 };
  }
  if (band === 'sent' || band === 'accepted') {
    return { steps: [...main], activeIndex: 1 };
  }
  return { steps: [...main], activeIndex: 0 };
}

export function invoiceJourneyModel(band: InvoiceViewBandStatus): JourneyStripModel {
  const steps = ['Draft', 'Outstanding', 'Paid'];
  if (band === 'void') {
    return { steps: ['Draft', 'Outstanding', 'Void'], activeIndex: 2, variant: 'neutral' };
  }
  if (band === 'paid') {
    return { steps, activeIndex: 2, allComplete: true };
  }
  if (band === 'sent' || band === 'overdue') {
    return { steps, activeIndex: 1 };
  }
  return { steps, activeIndex: 0 };
}

export function salesOrderJourneyModel(band: SalesOrderViewBandStatus): JourneyStripModel {
  const steps = ['Draft', 'Received', 'Confirmed', 'Dispatched', 'Delivered'];
  if (band === 'cancelled') {
    return {
      steps: ['Draft', 'Received', 'Confirmed', 'Dispatched', 'Cancelled'],
      activeIndex: 4,
      variant: 'danger',
    };
  }
  if (band === 'delivered') {
    return { steps, activeIndex: 4, allComplete: true };
  }
  if (band === 'dispatched') {
    return { steps, activeIndex: 3 };
  }
  if (band === 'confirmed') {
    return { steps, activeIndex: 2 };
  }
  if (band === 'received') {
    return { steps, activeIndex: 1 };
  }
  return { steps, activeIndex: 0 };
}

function formatStepTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildEstimateTimelineSteps(
  band: EstimateViewBandStatus,
  meta: { sentAt: string | null; validUntil: string | null },
): DocTimelineStep[] {
  const model = estimateJourneyModel(band);
  const sub: (string | null)[] = model.steps.map((label, i) => {
    if (label === 'Draft') return 'Not yet sent';
    if (label === 'Sent') return formatStepTime(meta.sentAt);
    if (label === 'Sales order' || label === 'Void' || label === 'Declined' || label === 'Expired') {
      if (band === 'converted' || band === 'invoiced') return 'Converted';
      return null;
    }
    return null;
  });
  return model.steps.map((label, i) => {
    const { state, terminalTone } = stepStateForIndex(model, i);
    return {
      id: `${label}-${i}`,
      label,
      subtext: sub[i],
      state,
      ...(terminalTone ? { terminalTone } : {}),
    };
  });
}

export function buildInvoiceTimelineSteps(
  band: InvoiceViewBandStatus,
  meta: { sentAt: string | null; paidAt: string | null; voidedAt: string | null },
): DocTimelineStep[] {
  const model = invoiceJourneyModel(band);
  const sub: (string | null)[] = model.steps.map((label) => {
    if (label === 'Draft') return 'Not yet sent';
    if (label === 'Outstanding') return formatStepTime(meta.sentAt);
    if (label === 'Paid') return formatStepTime(meta.paidAt);
    if (label === 'Void') return formatStepTime(meta.voidedAt);
    return null;
  });
  return model.steps.map((label, i) => {
    const { state, terminalTone } = stepStateForIndex(model, i);
    return {
      id: `${label}-${i}`,
      label,
      subtext: sub[i],
      state,
      ...(terminalTone ? { terminalTone } : {}),
    };
  });
}

export function buildSalesOrderTimelineSteps(
  band: SalesOrderViewBandStatus,
  meta: {
    receivedAt: string | null;
    confirmedAt: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
    placedAt: string | null;
  },
): DocTimelineStep[] {
  const model = salesOrderJourneyModel(band);
  const times: Record<string, string | null> = {
    Draft: meta.placedAt ? formatStepTime(meta.placedAt) : null,
    Received: formatStepTime(meta.receivedAt),
    Confirmed: formatStepTime(meta.confirmedAt),
    Dispatched: formatStepTime(meta.dispatchedAt),
    Delivered: formatStepTime(meta.deliveredAt),
    Cancelled: formatStepTime(meta.cancelledAt),
  };
  return model.steps.map((label, i) => {
    const { state, terminalTone } = stepStateForIndex(model, i);
    return {
      id: `${label}-${i}`,
      label,
      subtext: times[label] ?? null,
      state,
      ...(terminalTone ? { terminalTone } : {}),
    };
  });
}

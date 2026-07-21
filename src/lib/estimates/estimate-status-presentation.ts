import type { EstimateDbStatus, EstimateStatusTone } from '@/types/tenant-estimates';

export type NormalizedEstimateStatus = Exclude<EstimateDbStatus, 'pending'>;

const ALLOWED_STATUSES: NormalizedEstimateStatus[] = [
  'draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced', 'converted', 'void',
];

export function normalizeEstimateStatus(raw: string): NormalizedEstimateStatus {
  return ALLOWED_STATUSES.includes(raw as NormalizedEstimateStatus)
    ? (raw as NormalizedEstimateStatus)
    : 'draft';
}

export function estimateStatusPresentation(
  status: NormalizedEstimateStatus,
): { label: string; tone: EstimateStatusTone } {
  const map: Record<NormalizedEstimateStatus, { label: string; tone: EstimateStatusTone }> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'warning' },
    accepted: { label: 'Accepted', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    expired: { label: 'Expired', tone: 'neutral' },
    converted: { label: 'Converted', tone: 'success' },
    invoiced: { label: 'Invoiced', tone: 'success' },
    void: { label: 'Void', tone: 'neutral' },
  };
  return map[status];
}

export function nextEstimateStatusAfterSend(currentStatus: string): NormalizedEstimateStatus {
  return currentStatus === 'draft' ? 'sent' : normalizeEstimateStatus(currentStatus);
}

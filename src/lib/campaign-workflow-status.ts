export type RawCampaignStatus = 'draft' | 'published' | 'archived';

export type CampaignWorkflowStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'published_dirty'
  | 'expired'
  | 'archived';

export type CampaignWorkflowStatusLabel =
  | 'Draft'
  | 'Scheduled'
  | 'Live'
  | 'Live · Unpublished Changes'
  | 'Expired'
  | 'Archived';

export type CampaignWorkflowStatusTone = 'success' | 'warning' | 'neutral';

export function resolveCampaignWorkflowStatus(input: {
  rawStatus: RawCampaignStatus;
  validFrom: string | null;
  validTo: string | null;
  hasUnpublishedChanges?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowTs = now.getTime();
  const validFromTs = input.validFrom ? new Date(input.validFrom).getTime() : null;
  const validToTs = input.validTo ? new Date(input.validTo).getTime() : null;

  let value: CampaignWorkflowStatus;
  if (input.rawStatus === 'draft') {
    value = 'draft';
  } else if (input.rawStatus === 'archived') {
    value = 'archived';
  } else if (validToTs != null && validToTs < nowTs) {
    value = 'expired';
  } else if (validFromTs != null && validFromTs > nowTs) {
    value = 'scheduled';
  } else if (input.hasUnpublishedChanges) {
    value = 'published_dirty';
  } else {
    value = 'published';
  }

  const label: CampaignWorkflowStatusLabel =
    value === 'draft'
      ? 'Draft'
      : value === 'scheduled'
        ? 'Scheduled'
        : value === 'published'
          ? 'Live'
          : value === 'published_dirty'
            ? 'Live · Unpublished Changes'
            : value === 'expired'
              ? 'Expired'
              : 'Archived';

  const tone: CampaignWorkflowStatusTone =
    value === 'published'
      ? 'success'
      : value === 'draft' || value === 'scheduled' || value === 'published_dirty'
        ? 'warning'
        : 'neutral';

  return { value, label, tone };
}

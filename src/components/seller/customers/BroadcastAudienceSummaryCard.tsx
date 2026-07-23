'use client';

import { AlertCircle, CheckCircle2, PauseCircle, Wallet } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { AudiencePreviewResponse, WhatsAppTemplateOption } from '@/hooks/useWhatsAppBroadcasts';
import type { WhatsAppBroadcastTargetType } from '@/lib/zod';
import { formatWhatsAppTemplateLabel } from '@/lib/whatsapp-ui';

function formatTargetLabel(targetType: WhatsAppBroadcastTargetType) {
  switch (targetType) {
    case 'cohort':
      return 'Customer group';
    case 'geography_filter':
      return 'Geography';
    case 'dues_filter':
      return 'Outstanding dues';
    case 'dormant_filter':
      return 'Dormant buyers';
    case 'buyer_selection':
      return 'Selected buyers';
    case 'all_buyers':
      return 'All buyers';
    default:
      return targetType;
  }
}

function statusTone(status: 'draft_only' | 'ready' | 'pending_review' | 'paused' | 'blocked') {
  if (status === 'ready') return { icon: CheckCircle2, label: 'Ready', variant: 'success' as const };
  if (status === 'pending_review') return { icon: AlertCircle, label: 'Pending review', variant: 'warning' as const };
  if (status === 'paused') return { icon: PauseCircle, label: 'Paused', variant: 'danger' as const };
  if (status === 'blocked') return { icon: AlertCircle, label: 'Blocked', variant: 'danger' as const };
  return { icon: Wallet, label: 'Draft only', variant: 'info' as const };
}

export function BroadcastAudienceSummaryCard({
  broadcastName,
  scheduleLabel,
  selectedTemplate,
  targetType,
  targetDescription,
  preview,
  previewError,
  status,
}: {
  broadcastName: string;
  scheduleLabel: string;
  selectedTemplate: WhatsAppTemplateOption | null;
  targetType: WhatsAppBroadcastTargetType;
  targetDescription: string;
  preview: AudiencePreviewResponse | null;
  previewError: string | null;
  status: 'draft_only' | 'ready' | 'pending_review' | 'paused' | 'blocked';
}) {
  const tone = statusTone(status);
  const ToneIcon = tone.icon;

  return (
    <div className="space-y-3 rounded-[12px] border border-cream-300 bg-cream-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Broadcast summary</p>
          <p className="mt-1 text-sm text-cream-700">Review the selected template, audience, and current send state.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-cream-800">
          <ToneIcon size={12} />
          {tone.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
          <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Broadcast</p>
          <p className="mt-1 font-medium text-cream-900">{broadcastName}</p>
        </div>
        <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
          <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Template</p>
          <p className="mt-1 font-medium text-cream-900">
            {selectedTemplate ? formatWhatsAppTemplateLabel(selectedTemplate) : 'Not selected'}
          </p>
        </div>
        <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
          <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Schedule</p>
          <p className="mt-1 font-medium text-cream-900">{scheduleLabel}</p>
        </div>
        <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
          <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Audience</p>
          <p className="mt-1 font-medium text-cream-900">{formatTargetLabel(targetType)}</p>
          <p className="mt-0.5 text-xs text-cream-600">{targetDescription}</p>
        </div>
      </div>

      {preview ? (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Recipients</p>
            <p className="mt-1 font-medium text-cream-900">{preview.recipient_count}</p>
          </div>
          <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Opted out</p>
            <p className="mt-1 font-medium text-cream-900">{preview.opted_out_excluded}</p>
          </div>
          <div className="rounded-[10px] border border-cream-200 bg-white px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-cream-500">Est. cost</p>
            <p className="mt-1 font-medium text-cream-900">
              {preview.estimated_credits} cr · ₹{preview.estimated_inr.toFixed(2)}
            </p>
          </div>
        </div>
      ) : null}

      {previewError ? (
        <Alert variant="danger">
          <AlertTitle>Audience preview failed</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

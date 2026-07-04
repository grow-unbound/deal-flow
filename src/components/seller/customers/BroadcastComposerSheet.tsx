'use client';

import { useMemo, useState } from 'react';
import { MessageCircle, Users2, MapPin, Clock, Wallet, CheckCircle2, Info } from 'lucide-react';
import {
  FormOverlay,
  FormOverlayHeader,
  FormOverlayBody,
  FormOverlayFooter,
} from '@/components/ui/form-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import {
  useWhatsAppTemplates,
  useAudiencePreview,
  useCreateWhatsAppBroadcast,
  useWhatsAppPlatformStatus,
  type WhatsAppTemplateOption,
} from '@/hooks/useWhatsAppBroadcasts';
import { WHATSAPP_QUALITY_BANNER_COPY } from '@/constants/whatsapp-quality-banner';
import type { WhatsAppBroadcastTargetType } from '@/lib/zod';

// Numeric step union, mirrors the CsvImportFlow.tsx convention (0-indexed
// literal steps, not a string enum).
type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ['Template', 'Audience', 'Review & send', 'Done'] as const;

const TARGET_MODES: Array<{ value: WhatsAppBroadcastTargetType; label: string; description: string }> = [
  { value: 'cohort', label: 'Customer group', description: 'Send to everyone in a saved cohort' },
  { value: 'geography_filter', label: 'Geography', description: 'Filter by city, e.g. all buyers in Nashik' },
  { value: 'dues_filter', label: 'Outstanding dues', description: 'Buyers with overdue invoices' },
  { value: 'dormant_filter', label: 'Dormant buyers', description: "Haven't ordered in a while" },
  { value: 'buyer_selection', label: 'Manual selection', description: 'Pick specific buyers by ID' },
  { value: 'all_buyers', label: 'All buyers', description: 'Everyone in your customer list' },
];

export function BroadcastComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplateOption | null>(null);
  const [broadcastName, setBroadcastName] = useState('');
  const [targetType, setTargetType] = useState<WhatsAppBroadcastTargetType>('all_buyers');
  const [targetCohortId, setTargetCohortId] = useState<string | null>(null);
  const [geographyCity, setGeographyCity] = useState('');
  const [dormantDays, setDormantDays] = useState('45');
  const [manualBuyerIdsRaw, setManualBuyerIdsRaw] = useState('');

  const { data: templates, isLoading: templatesLoading } = useWhatsAppTemplates(open);
  const { data: cohorts } = useTenantCohortOptions(open);
  const { data: platformStatus } = useWhatsAppPlatformStatus(open);
  const audiencePreview = useAudiencePreview();
  const createBroadcast = useCreateWhatsAppBroadcast();

  // Phase F (§7.3) — quality-rating banner copy is a config value
  // (src/constants/whatsapp-quality-banner.ts), not hardcoded here.
  const qualityBanner = platformStatus
    ? WHATSAPP_QUALITY_BANNER_COPY[platformStatus.quality_rating_state]
    : null;

  const manualBuyerIds = useMemo(
    () =>
      manualBuyerIdsRaw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [manualBuyerIdsRaw],
  );

  const targetFilter = useMemo<Record<string, string | number> | null>(() => {
    if (targetType === 'geography_filter') {
      return geographyCity.trim() ? { city: geographyCity.trim() } : null;
    }
    if (targetType === 'dormant_filter') {
      const n = Number(dormantDays);
      const days: Record<string, number> = { dormant_days_gt: Number.isFinite(n) && n > 0 ? n : 45 };
      return days;
    }
    return null;
  }, [targetType, geographyCity, dormantDays]);

  function resetAndClose() {
    setStep(0);
    setSelectedTemplate(null);
    setBroadcastName('');
    setTargetType('all_buyers');
    setTargetCohortId(null);
    setGeographyCity('');
    setDormantDays('45');
    setManualBuyerIdsRaw('');
    audiencePreview.reset();
    onOpenChange(false);
  }

  function handlePreview() {
    audiencePreview.mutate({
      target_type: targetType,
      target_cohort_id: targetType === 'cohort' ? targetCohortId : null,
      target_filter: targetFilter,
      target_buyer_ids: targetType === 'buyer_selection' ? manualBuyerIds : null,
      meta_category: selectedTemplate?.meta_category,
    });
  }

  function handleSend() {
    if (!selectedTemplate) return;
    createBroadcast.mutate(
      {
        name: broadcastName.trim() || `${selectedTemplate.use_case} broadcast`,
        whatsapp_template_id: selectedTemplate.id,
        use_case: selectedTemplate.use_case,
        target_type: targetType,
        target_cohort_id: targetType === 'cohort' ? targetCohortId : null,
        target_filter: targetFilter,
        target_buyer_ids: targetType === 'buyer_selection' ? manualBuyerIds : null,
        variable_bindings: {},
      },
      {
        onSuccess: () => setStep(3),
      },
    );
  }

  const canGoToAudience = Boolean(selectedTemplate);
  const canPreview =
    (targetType === 'cohort' && Boolean(targetCohortId)) ||
    (targetType === 'geography_filter' && Boolean(geographyCity.trim())) ||
    (targetType === 'buyer_selection' && manualBuyerIds.length > 0) ||
    targetType === 'dormant_filter' ||
    targetType === 'dues_filter' ||
    targetType === 'all_buyers';

  return (
    <FormOverlay open={open} onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())}>
      <FormOverlayHeader
        eyebrow={`Step ${step + 1} of ${STEP_LABELS.length} · ${STEP_LABELS[step]}`}
        title="Broadcast message"
        description="Send a WhatsApp message to a group of your customers."
      />

      <FormOverlayBody>
        {qualityBanner?.showBanner ? (
          <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-warning-300 bg-warning-50 px-3 py-2.5 text-sm text-warning-800">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>{qualityBanner.message}</p>
          </div>
        ) : null}

        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-cream-700">Choose a message template.</p>
            {templatesLoading ? (
              <p className="text-sm text-cream-500">Loading templates…</p>
            ) : (
              <div className="space-y-2">
                {(templates ?? []).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplate(template)}
                    className={`w-full rounded-[10px] border px-3 py-3 text-left transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'border-teal-400 bg-teal-50'
                        : 'border-cream-300 bg-white hover:bg-cream-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-medium text-cream-900">
                        {template.use_case.replace(/_/g, ' ')}
                      </p>
                      <Badge variant={template.meta_category === 'marketing' ? 'ember' : 'teal'}>
                        {template.meta_category}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-cream-700">{template.body}</p>
                    {template.approval_status !== 'approved' ? (
                      <p className="mt-1 text-xs text-warning-700">
                        Awaiting Meta approval — visible for setup, not yet sendable.
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2">
              <label className="text-body-sm font-medium text-cream-800">Broadcast name (internal)</label>
              <Input
                value={broadcastName}
                onChange={(e) => setBroadcastName(e.target.value)}
                placeholder="e.g. July new-stock nudge"
                className="mt-1.5"
              />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-cream-700">Who should get this message?</p>
            <RadioGroup value={targetType} onValueChange={(v) => setTargetType(v as WhatsAppBroadcastTargetType)}>
              {TARGET_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-cream-300 bg-white px-3 py-2.5 hover:bg-cream-50"
                >
                  <RadioGroupItem value={mode.value} className="mt-1" />
                  <div>
                    <p className="text-base font-medium text-cream-900">{mode.label}</p>
                    <p className="text-sm text-cream-700">{mode.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {targetType === 'cohort' ? (
              <div className="space-y-1.5">
                <label className="text-body-sm font-medium text-cream-800">Customer group</label>
                <select
                  className="w-full rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-sm"
                  value={targetCohortId ?? ''}
                  onChange={(e) => setTargetCohortId(e.target.value || null)}
                >
                  <option value="">Select a group…</option>
                  {(cohorts ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.member_count})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {targetType === 'geography_filter' ? (
              <div className="space-y-1.5">
                <label className="text-body-sm font-medium text-cream-800 flex items-center gap-1.5">
                  <MapPin size={14} /> City
                </label>
                <Input
                  value={geographyCity}
                  onChange={(e) => setGeographyCity(e.target.value)}
                  placeholder="e.g. Nashik"
                />
              </div>
            ) : null}

            {targetType === 'dormant_filter' ? (
              <div className="space-y-1.5">
                <label className="text-body-sm font-medium text-cream-800 flex items-center gap-1.5">
                  <Clock size={14} /> Dormant for more than (days)
                </label>
                <Input
                  type="number"
                  value={dormantDays}
                  onChange={(e) => setDormantDays(e.target.value)}
                  min={1}
                />
              </div>
            ) : null}

            {targetType === 'buyer_selection' ? (
              <div className="space-y-1.5">
                <label className="text-body-sm font-medium text-cream-800 flex items-center gap-1.5">
                  <Users2 size={14} /> Buyer IDs (comma or space separated)
                </label>
                <textarea
                  className="w-full rounded-[8px] border border-cream-300 bg-white px-3 py-2 text-sm"
                  rows={3}
                  value={manualBuyerIdsRaw}
                  onChange={(e) => setManualBuyerIdsRaw(e.target.value)}
                  placeholder="Paste buyer UUIDs"
                />
              </div>
            ) : null}

            <div className="rounded-[10px] border border-cream-300 bg-cream-50 p-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handlePreview}
                disabled={!canPreview || audiencePreview.isPending}
              >
                {audiencePreview.isPending ? 'Calculating…' : 'Preview audience & cost'}
              </Button>

              {audiencePreview.data ? (
                <div className="mt-3 space-y-1 text-sm text-cream-800">
                  <p>
                    <strong>{audiencePreview.data.recipient_count}</strong> buyers will receive this message.
                  </p>
                  {audiencePreview.data.opted_out_excluded > 0 ? (
                    <p className="text-cream-600">
                      {audiencePreview.data.opted_out_excluded} selected buyers are opted out of WhatsApp and were excluded.
                    </p>
                  ) : null}
                  <p className="flex items-center gap-1.5">
                    <Wallet size={14} />
                    Estimated cost: <strong>{audiencePreview.data.estimated_credits} credits</strong>
                    {' '}(₹{audiencePreview.data.estimated_inr.toFixed(2)})
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-cream-700">Review before scheduling.</p>
            <div className="rounded-[10px] border border-cream-300 bg-white p-3 text-sm">
              <p><span className="text-cream-600">Template:</span> {selectedTemplate?.use_case.replace(/_/g, ' ')}</p>
              <p><span className="text-cream-600">Audience:</span> {TARGET_MODES.find((m) => m.value === targetType)?.label}</p>
              <p>
                <span className="text-cream-600">Recipients:</span>{' '}
                {audiencePreview.data?.recipient_count ?? '—'}
              </p>
              <p>
                <span className="text-cream-600">Estimated cost:</span>{' '}
                {audiencePreview.data ? `${audiencePreview.data.estimated_credits} credits` : '—'}
              </p>
            </div>
            <p className="text-xs text-cream-500">
              This saves your broadcast and its audience — actual WhatsApp delivery goes out in a
              later release once the sending pipeline is live. You won&apos;t be charged until then.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <CheckCircle2 size={40} className="text-teal-500" />
            <p className="text-base font-medium text-cream-900">Broadcast saved</p>
            <p className="max-w-sm text-sm text-cream-700">
              {createBroadcast.data?.note ??
                'Your broadcast and audience have been saved. Sending goes out in a later release.'}
            </p>
          </div>
        ) : null}
      </FormOverlayBody>

      <FormOverlayFooter>
        {step === 0 ? (
          <>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStep(1)} disabled={!canGoToAudience} className="ml-auto">
              <MessageCircle size={14} /> Next: audience
            </Button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              disabled={!audiencePreview.data}
              className="ml-auto"
            >
              Next: review
            </Button>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={createBroadcast.isPending}
              className="ml-auto"
            >
              {createBroadcast.isPending ? 'Saving…' : 'Schedule broadcast'}
            </Button>
          </>
        ) : null}
        {step === 3 ? (
          <Button variant="primary" onClick={resetAndClose} className="ml-auto">Done</Button>
        ) : null}
      </FormOverlayFooter>
    </FormOverlay>
  );
}

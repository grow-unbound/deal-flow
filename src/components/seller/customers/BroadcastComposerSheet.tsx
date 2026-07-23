'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info, MessageCircle, Send } from 'lucide-react';
import {
  FormOverlay,
  FormOverlayBody,
  FormOverlayFooter,
  FormOverlayHeader,
} from '@/components/ui/form-overlay';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTenantCohortOptions } from '@/hooks/useCohorts';
import {
  type WhatsAppTemplateOption,
  useAudiencePreview,
  useBroadcastCampaignOptions,
  useCreateWhatsAppBroadcast,
  useWhatsAppPlatformStatus,
  useWhatsAppTemplates,
} from '@/hooks/useWhatsAppBroadcasts';
import { WHATSAPP_QUALITY_BANNER_COPY } from '@/constants/whatsapp-quality-banner';
import { SellerBuyerPickerOverlay } from '@/components/seller/shared/SellerBuyerPickerOverlay';
import type { WhatsAppBroadcastTargetType } from '@/lib/zod';
import { formatWhatsAppTemplateLabel } from '@/lib/whatsapp-ui';

const BEAT_ROUTE_TEMPLATE = 'beat_route_buyer';
const CAMPAIGN_TEMPLATE_USE_CASES = new Set(['campaigns']);
const SELECT_BUYERS_VALUE = '__select_buyers__';

const BEAT_ROUTE_FIELD_META: Record<string, { label: string; placeholder: string; helper: string }> = {
  visit_date: {
    label: 'Visit date',
    placeholder: '26 July',
    helper: 'Shown in the message as the visit date',
  },
  visit_window: {
    label: 'Visit time window',
    placeholder: '3:30PM–5:30PM',
    helper: 'Time window for the visit',
  },
};

function combineScheduledAt(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return null;
  const [year, month, day] = dateValue.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function editableVariables(template: WhatsAppTemplateOption | null) {
  if (!template || template.meta_template_name !== BEAT_ROUTE_TEMPLATE) return [];
  return template.variables.filter((variable) => variable.key === 'visit_date' || variable.key === 'visit_window');
}

export function BroadcastComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [broadcastName, setBroadcastName] = useState('');
  const [targetType, setTargetType] = useState<Extract<WhatsAppBroadcastTargetType, 'cohort' | 'buyer_selection'>>('cohort');
  const [targetCohortId, setTargetCohortId] = useState<string | null>(null);
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([]);
  const [variableBindings, setVariableBindings] = useState<Record<string, string>>({});
  const [sendNow, setSendNow] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [linkedCampaignId, setLinkedCampaignId] = useState<string | null>(null);

  const { data: rawTemplates = [], isLoading: templatesLoading } = useWhatsAppTemplates(open);
  const { data: cohorts = [] } = useTenantCohortOptions(open);
  const { data: platformStatus } = useWhatsAppPlatformStatus(open);
  const { data: campaignOptions = [] } = useBroadcastCampaignOptions(open);
  const audiencePreview = useAudiencePreview();
  const createBroadcast = useCreateWhatsAppBroadcast();

  const qualityBanner = platformStatus
    ? WHATSAPP_QUALITY_BANNER_COPY[platformStatus.quality_rating_state]
    : null;

  const templates = useMemo(
    () => rawTemplates.filter((template) => template.is_broadcast_template),
    [rawTemplates],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const selectedCampaign = useMemo(
    () => campaignOptions.find((campaign) => campaign.id === linkedCampaignId) ?? null,
    [campaignOptions, linkedCampaignId],
  );

  const requiresCampaign = Boolean(selectedTemplate && CAMPAIGN_TEMPLATE_USE_CASES.has(selectedTemplate.use_case));
  const templateBlockedReason = selectedTemplate?.broadcast_supported === false
    ? (selectedTemplate.broadcast_support_reason ?? 'This template cannot be used for broadcasts')
    : null;
  const manualVariables = editableVariables(selectedTemplate);
  const isBeatRouteTemplate = selectedTemplate?.meta_template_name === BEAT_ROUTE_TEMPLATE;
  const beatRouteManualComplete = !isBeatRouteTemplate
    || (Boolean(variableBindings.visit_date?.trim()) && Boolean(variableBindings.visit_window?.trim()));
  const scheduledFor = combineScheduledAt(scheduledDate, scheduledTime);
  const canPreview = Boolean(selectedTemplate)
    && !templateBlockedReason
    && beatRouteManualComplete
    && ((targetType === 'cohort' && Boolean(targetCohortId)) || (targetType === 'buyer_selection' && selectedBuyerIds.length > 0))
    && (sendNow || Boolean(scheduledFor))
    && (!requiresCampaign || Boolean(linkedCampaignId));

  const previewPayloadKey = JSON.stringify({
    targetType,
    targetCohortId,
    selectedBuyerIds,
    metaCategory: selectedTemplate?.meta_category ?? null,
  });

  useEffect(() => {
    if (!open) return;
    if (!selectedTemplate || !canPreview) {
      audiencePreview.reset();
      return;
    }
    audiencePreview.mutate({
      target_type: targetType,
      target_cohort_id: targetType === 'cohort' ? targetCohortId : null,
      target_filter: null,
      target_buyer_ids: targetType === 'buyer_selection' ? selectedBuyerIds : null,
      meta_category: selectedTemplate.meta_category,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canPreview, previewPayloadKey]);

  function resetAndClose() {
    setSelectedTemplateId('');
    setBroadcastName('');
    setTargetType('cohort');
    setTargetCohortId(null);
    setSelectedBuyerIds([]);
    setVariableBindings({});
    setSendNow(true);
    setScheduledDate('');
    setScheduledTime('09:00');
    setLinkedCampaignId(null);
    setBuyerPickerOpen(false);
    audiencePreview.reset();
    onOpenChange(false);
  }

  function updateTemplate(nextTemplateId: string) {
    setSelectedTemplateId(nextTemplateId);
    const template = templates.find((item) => item.id === nextTemplateId) ?? null;
    setVariableBindings((current) => {
      const next: Record<string, string> = {};
      for (const variable of editableVariables(template)) {
        next[variable.key] = current[variable.key] ?? '';
      }
      return next;
    });
    if (template && !broadcastName.trim()) {
      setBroadcastName(`${formatWhatsAppTemplateLabel(template)} broadcast`);
    }
    if (!template || !CAMPAIGN_TEMPLATE_USE_CASES.has(template.use_case)) {
      setLinkedCampaignId(null);
    }
  }

  function updateVariableBinding(key: string, value: string) {
    setVariableBindings((current) => ({ ...current, [key]: value }));
  }

  function handleSendBroadcast() {
    if (!selectedTemplate || !canPreview || templateBlockedReason) return;

    createBroadcast.mutate(
      {
        name: broadcastName.trim() || `${formatWhatsAppTemplateLabel(selectedTemplate)} broadcast`,
        whatsapp_template_id: selectedTemplate.id,
        use_case: selectedTemplate.use_case,
        target_type: targetType,
        target_cohort_id: targetType === 'cohort' ? targetCohortId : null,
        target_filter: null,
        target_buyer_ids: targetType === 'buyer_selection' ? selectedBuyerIds : null,
        linked_campaign_id: requiresCampaign ? linkedCampaignId : null,
        variable_bindings: variableBindings,
        scheduled_for: sendNow ? null : scheduledFor,
      },
      {
        onSuccess: () => resetAndClose(),
      },
    );
  }

  const previewErrorMessage = audiencePreview.error instanceof Error ? audiencePreview.error.message : null;
  const targetBuyerValue = targetType === 'buyer_selection' ? SELECT_BUYERS_VALUE : (targetCohortId ?? '');

  return (
    <FormOverlay open={open} onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())}>
      <FormOverlayHeader
        eyebrow="Broadcast"
        title="Broadcast message"
        description="Choose the audience, message template, and schedule in one clean flow."
      />

      <FormOverlayBody className="space-y-5">
        {qualityBanner?.showBanner ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-warning-300 bg-warning-50 px-3 py-2.5 text-sm text-warning-800">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>{qualityBanner.message}</p>
          </div>
        ) : null}

        <section className="space-y-2">
          <label className="text-body-sm font-medium text-cream-800">Broadcast name</label>
          <Input
            value={broadcastName}
            onChange={(event) => setBroadcastName(event.target.value)}
            placeholder="e.g. July new-stock nudge"
          />
        </section>

        <section className="space-y-2">
          <label className="text-body-sm font-medium text-cream-800">Target buyers</label>
          <Select
            value={targetBuyerValue}
            onValueChange={(value) => {
              if (value === SELECT_BUYERS_VALUE) {
                setTargetType('buyer_selection');
                setBuyerPickerOpen(true);
                return;
              }
              setTargetType('cohort');
              setTargetCohortId(value || null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a customer group" />
            </SelectTrigger>
            <SelectContent>
              {cohorts.map((cohort) => (
                <SelectItem key={cohort.id} value={cohort.id}>
                  {cohort.name} ({cohort.member_count} buyers)
                </SelectItem>
              ))}
              <SelectItem value={SELECT_BUYERS_VALUE}>
                Select buyers{targetType === 'buyer_selection' && selectedBuyerIds.length > 0 ? ` (${selectedBuyerIds.length})` : ''}
              </SelectItem>
            </SelectContent>
          </Select>
          {targetType === 'buyer_selection' ? (
            <div className="space-y-1 flex justify-end items-end">
              <button
                type="button"
                onClick={() => setBuyerPickerOpen(true)}
                className="text-xs font-medium text-teal-700 hover:text-teal-800"
              >
                Change selected buyers
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <label className="text-body-sm font-medium text-cream-800">Select template</label>
          <Select value={selectedTemplateId} onValueChange={updateTemplate} disabled={templatesLoading}>
            <SelectTrigger>
              <SelectValue placeholder={templatesLoading ? 'Loading templates…' : 'Choose a template'} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem
                  key={template.id}
                  value={template.id}
                  disabled={template.broadcast_supported === false}
                >
                  {formatWhatsAppTemplateLabel(template)}
                  {template.broadcast_supported === false && template.broadcast_support_reason
                    ? ` — ${template.broadcast_support_reason}`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate ? (
            <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Preview</p>
                <span className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-cream-700">
                  {selectedTemplate.meta_category}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.6] text-cream-900">{selectedTemplate.body}</p>
            </div>
          ) : null}

          {requiresCampaign ? (
            <div className="space-y-2">
              <label className="text-body-sm font-medium text-cream-800">Linked campaign</label>
              <Select value={linkedCampaignId ?? ''} onValueChange={(value) => setLinkedCampaignId(value || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a published campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaignOptions.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCampaign ? (
                <p className="text-xs text-cream-500">The CTA button will open this campaign for buyers.</p>
              ) : null}
            </div>
          ) : null}

          {manualVariables.length > 0 ? (
            <div className="space-y-3">
              {manualVariables.map((variable) => {
                const fieldMeta = BEAT_ROUTE_FIELD_META[variable.key];
                return (
                  <div key={variable.key} className="space-y-1.5">
                    <label className="text-body-sm font-medium text-cream-800">
                      {fieldMeta?.label ?? variable.key.replace(/_/g, ' ')}
                    </label>
                    <Input
                      value={variableBindings[variable.key] ?? ''}
                      onChange={(event) => updateVariableBinding(variable.key, event.target.value)}
                      placeholder={fieldMeta?.placeholder ?? variable.description ?? `Enter ${variable.key}`}
                    />
                    {fieldMeta?.helper ? (
                      <p className="text-xs text-cream-500">{fieldMeta.helper}</p>
                    ) : variable.description ? (
                      <p className="text-xs text-cream-500">{variable.description}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {selectedTemplate && selectedTemplate.approval_status !== 'approved' ? (
            <Alert variant="warning">
              <AlertTitle>Template not approved yet</AlertTitle>
              <AlertDescription>
                This template can be previewed here, but sending stays blocked until Meta approval is complete.
              </AlertDescription>
            </Alert>
          ) : null}

          {templateBlockedReason ? (
            <Alert variant="warning">
              <AlertTitle>Template unavailable for broadcasts</AlertTitle>
              <AlertDescription>{templateBlockedReason}</AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between bg-white py-3">
            <div className="space-y-0.5">
              <p className="text-base font-medium text-cream-900">Send broadcast now</p>
              <p className="text-sm text-cream-700">Turn this off to schedule a future send.</p>
            </div>
            <Switch checked={sendNow} onCheckedChange={setSendNow} />
          </div>

          {!sendNow ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <DatePicker
                label="Schedule date"
                value={scheduledDate}
                onChange={setScheduledDate}
                mode="overlay"
                showSummary={false}
                triggerClassName="h-[42px] rounded-[10px] border border-cream-400 bg-[var(--bg-surface)] px-3.5 text-base text-cream-900 shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:border-[#B5642F] focus-visible:ring-2 focus-visible:ring-[#B5642F]/20 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50"
              />

              <div className="space-y-1.5">
                <label className="text-body-sm font-medium text-cream-800">Schedule time</label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => setScheduledTime(event.target.value)}
                  className="h-[42px] rounded-[10px] border-cream-400 bg-[var(--bg-surface)] px-3.5 text-base text-cream-900 shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] focus-visible:border-[#B5642F] focus-visible:ring-[#B5642F]/20"
                />
              </div>
            </div>
          ) : null}
        </section>

        {previewErrorMessage ? (
          <Alert variant="danger">
            <AlertTitle>Audience preview failed</AlertTitle>
            <AlertDescription>{previewErrorMessage}</AlertDescription>
          </Alert>
        ) : null}
      </FormOverlayBody>

      <FormOverlayFooter className="justify-end gap-2">
        <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSendBroadcast}
          disabled={
            !selectedTemplate
            || !canPreview
            || !audiencePreview.data
            || Boolean(previewErrorMessage)
            || audiencePreview.isPending
            || createBroadcast.isPending
            || (requiresCampaign && !linkedCampaignId)
            || (!sendNow && !scheduledFor)
            || Boolean(templateBlockedReason)
          }
        >
          {sendNow ? <Send size={14} /> : <MessageCircle size={14} />}
          {createBroadcast.isPending
            ? (sendNow ? 'Sending…' : 'Scheduling…')
            : `Send broadcast ${sendNow ? 'now' : 'later'}`}
        </Button>
      </FormOverlayFooter>

      <SellerBuyerPickerOverlay
        open={buyerPickerOpen}
        onOpenChange={setBuyerPickerOpen}
        title="Select target buyers"
        selectedBuyerIds={selectedBuyerIds}
        onSelectedBuyerIdsChange={setSelectedBuyerIds}
        applyLabel={`Use ${selectedBuyerIds.length} buyer${selectedBuyerIds.length === 1 ? '' : 's'}`}
        onApply={() => {
          setTargetType('buyer_selection');
        }}
      />
    </FormOverlay>
  );
}

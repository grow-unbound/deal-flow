'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Info, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { NotificationToggleRow } from '@/components/seller/settings/NotificationToggleRow';
import { WhatsAppTemplatePreview } from '@/components/seller/catalogs/detail/WhatsAppTemplatePreview';
import type {
  CatalogNotifyRecipientFilter,
} from '@/hooks/useCatalogs';
import { useCatalogPublishVerification } from '@/hooks/useCatalogs';

export type PublishCampaignDialogMode = 'first_publish' | 'publish_updates' | 'notify_buyers';

export interface PublishCampaignDialogCampaignSummary {
  name: string;
  valid_from: string;
  valid_to: string | null;
  audience_label: string;
  products_count: number;
  pricing_scheme: string;
  buyer_note: string;
  hero_image_url: string | null;
}

export interface PublishCampaignDialogRecipientSegments {
  all_eligible: number;
  not_viewed: number;
  viewed_not_ordered: number;
}

function combineScheduledAt(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return null;
  const [year, month, day] = dateValue.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatValidity(validFrom: string, validTo: string | null) {
  const from = new Date(validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const to = validTo
    ? new Date(validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No end date';
  return `${from} → ${to}`;
}

const RECIPIENT_FILTER_LABELS: Record<CatalogNotifyRecipientFilter, { label: string; description: string }> = {
  all_eligible: {
    label: 'All eligible buyers',
    description: 'Send to every buyer in this campaign audience.',
  },
  not_viewed: {
    label: 'Did not open yet',
    description: 'Buyers in the target audience who have not opened this campaign yet.',
  },
  viewed_not_ordered: {
    label: 'Opened but did not order yet',
    description: 'Buyers who opened this campaign but have not placed a campaign-linked order yet.',
  },
};

function VerificationStatsSkeleton() {
  return (
    <div className="grid gap-3 rounded-lg bg-cream-50 p-3 text-sm text-cream-800 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-cream-100" />
          <div className="h-5 w-20 animate-pulse rounded bg-cream-100" />
        </div>
      ))}
    </div>
  );
}

export interface PublishCampaignDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PublishCampaignDialogMode;
  campaignSummary?: PublishCampaignDialogCampaignSummary;
  recipientSegments?: PublishCampaignDialogRecipientSegments;
  isPublishing: boolean;
  onNotifyWhatsappChange?: (enabled: boolean) => void;
  onPublish: (input: {
    notifyWhatsapp: boolean;
    buyerNote: string;
    notifyScheduledFor: string | null;
    heroImageUrl: string | null;
    recipientFilter?: CatalogNotifyRecipientFilter;
  }) => Promise<void>;
}

export function PublishCampaignDialog({
  campaignId,
  open,
  onOpenChange,
  mode,
  campaignSummary,
  recipientSegments,
  isPublishing,
  onNotifyWhatsappChange,
  onPublish,
}: PublishCampaignDialogProps) {
  const isFirstPublish = mode === 'first_publish';
  const isPublishUpdates = mode === 'publish_updates';
  const isNotifyBuyers = mode === 'notify_buyers';
  const openInitRef = useRef(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [buyerNote, setBuyerNote] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [recipientFilter, setRecipientFilter] = useState<CatalogNotifyRecipientFilter>('all_eligible');
  const verificationQuery = useCatalogPublishVerification(campaignId, open && !isPublishUpdates);
  const verification = verificationQuery.data;

  useEffect(() => {
    if (!open) {
      openInitRef.current = false;
      return;
    }
    if (!campaignSummary || openInitRef.current) return;
    openInitRef.current = true;
    setBuyerNote(campaignSummary.buyer_note ?? '');
    setNotifyWhatsapp(true);
    setSendNow(true);
    setScheduledDate('');
    setScheduledTime('09:00');
    setRecipientFilter('all_eligible');
  }, [campaignSummary, open]);

  function handleNotifyChange(checked: boolean) {
    setNotifyWhatsapp(checked);
    onNotifyWhatsappChange?.(checked);
  }

  const campaign = campaignSummary;

  const scheduledFor = useMemo(
    () => (sendNow ? null : combineScheduledAt(scheduledDate, scheduledTime)),
    [sendNow, scheduledDate, scheduledTime],
  );

  const selectedRecipientCount = recipientSegments
    ? (isNotifyBuyers
    ? recipientSegments[recipientFilter]
    : recipientSegments.all_eligible)
    : 0;
  const computedEstimatedCredits = selectedRecipientCount * (verification?.whatsapp.credits_per_message ?? 0);
  const computedEstimatedInr = Math.round(computedEstimatedCredits * (verification?.whatsapp.credit_price_inr ?? 0) * 100) / 100;

  const whatsappBlockers = useMemo(() => {
    if (isPublishUpdates) return [];
    const blockers: string[] = [];
    if (!verification) return blockers;
    if ((isFirstPublish || isNotifyBuyers) && notifyWhatsapp && buyerNote.trim().length === 0) {
      blockers.push('Add a buyer note before sending the WhatsApp campaign announcement');
    }
    if (!verification.whatsapp.feature_enabled) blockers.push('WhatsApp broadcast feature is not enabled for this tenant');
    if (!verification.whatsapp.template_approved) blockers.push('WhatsApp template is not approved yet');
    if (!verification.whatsapp.tenant_phone_configured) blockers.push('Tenant WhatsApp contact number is missing or invalid');
    if (verification.whatsapp.broadcast_sending_paused) blockers.push('Broadcast sending is temporarily paused platform-wide');
    if (verification.whatsapp.quality_rating_blocked) blockers.push('WhatsApp quality rating is red — marketing sends are blocked');
    if (selectedRecipientCount === 0) {
      blockers.push(
        isNotifyBuyers
          ? 'No buyers match this recipient filter'
          : 'No buyers are available in this campaign audience',
      );
    }
    if (verification.whatsapp.credits_balance < computedEstimatedCredits) {
      blockers.push(
        `Insufficient credits (${verification.whatsapp.credits_balance} available, ${computedEstimatedCredits} required)`,
      );
    }
    return blockers;
  }, [computedEstimatedCredits, isNotifyBuyers, isPublishUpdates, selectedRecipientCount, verification]);

  const canPublish = Boolean(campaign)
    && (
      isPublishUpdates
      || (isFirstPublish && (!notifyWhatsapp || (Boolean(verification) && whatsappBlockers.length === 0)))
      || (isNotifyBuyers && Boolean(verification) && whatsappBlockers.length === 0)
    )
    && (sendNow || Boolean(scheduledFor));

  const submitLabel = isPublishing
    ? (isNotifyBuyers ? 'Queueing notify…' : 'Publishing…')
    : isNotifyBuyers
      ? 'Notify buyers'
      : isFirstPublish
        ? (notifyWhatsapp ? 'Publish & notify' : 'Publish campaign')
        : 'Publish updates';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px]">
        <DialogHeader>
          <DialogTitle>
            {isFirstPublish ? 'Publish campaign' : isNotifyBuyers ? 'Notify buyers' : 'Publish updates'}
          </DialogTitle>
          <DialogDescription>
            {isFirstPublish
              ? 'Review the campaign summary and notify eligible buyers on WhatsApp.'
              : isNotifyBuyers
                ? 'Choose which buyers should receive a WhatsApp reminder for this campaign.'
                : 'Push the staged campaign updates live for buyers.'}
          </DialogDescription>
        </DialogHeader>

        {campaign && recipientSegments ? (
          <>
            <DialogBody className="grid min-h-[34rem] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-4">
            <h3 className="text-lg font-semibold text-cream-950">{campaign.name}</h3>
            <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
              <dt className="text-sm text-cream-600">Validity</dt>
              <dd className="text-sm font-medium text-cream-900">
                {formatValidity(campaign.valid_from, campaign.valid_to)}
              </dd>
              <dt className="text-sm text-cream-600">Audience</dt>
              <dd className="text-sm font-medium text-cream-900">{campaign.audience_label}</dd>
              <dt className="text-sm text-cream-600">Products</dt>
              <dd className="text-sm font-medium text-cream-900">{campaign.products_count}</dd>
              <dt className="text-sm text-cream-600">Pricing</dt>
              <dd className="text-sm font-medium text-cream-900">{campaign.pricing_scheme}</dd>
            </dl>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buyer-note">Note to buyers</Label>
            <Textarea
              id="buyer-note"
              value={buyerNote}
              onChange={(event) => setBuyerNote(event.target.value.slice(0, 200))}
              rows={3}
              placeholder="Short note shown in the buyer app and WhatsApp message"
            />
            <p className="text-xs text-cream-500">{buyerNote.length}/200 characters</p>
          </div>

          {isFirstPublish && verification?.whatsapp.feature_enabled ? (
            <div className="space-y-4">
              <NotificationToggleRow
                label="Notify buyers on WhatsApp"
                description="Sends the campaign_announcement template to buyers in this campaign audience."
                checked={notifyWhatsapp}
                onCheckedChange={handleNotifyChange}
              />

              {notifyWhatsapp ? (
                <>
                  {verification ? (
                    <div className="grid gap-3 rounded-lg bg-cream-50 p-3 text-sm text-cream-800 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-cream-500">Recipients</p>
                        <p className="font-medium">{recipientSegments.all_eligible}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-cream-500">Estimated credits</p>
                        <p className="font-medium">
                          {computedEstimatedCredits}
                          {' '}
                          ({verification.whatsapp.credits_per_message}/msg)
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-cream-500">Balance</p>
                        <p className="font-medium">{verification.whatsapp.credits_balance}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-cream-500">Est. cost</p>
                        <p className="font-medium">₹{computedEstimatedInr}</p>
                      </div>
                    </div>
                  ) : (
                    <VerificationStatsSkeleton />
                  )}

                  <div className="space-y-1.5">
                    <NotificationToggleRow
                      label="Send now"
                      description="Turn off to schedule the WhatsApp blast."
                      checked={sendNow}
                      onCheckedChange={setSendNow}
                    />
                  </div>

                  {!sendNow ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Date</Label>
                        <DatePicker value={scheduledDate} onChange={setScheduledDate} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="schedule-time">Time</Label>
                        <Input id="schedule-time" type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {isNotifyBuyers ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Recipients</Label>
                <RadioGroup value={recipientFilter} onValueChange={(value) => setRecipientFilter(value as CatalogNotifyRecipientFilter)}>
                  {(Object.keys(RECIPIENT_FILTER_LABELS) as CatalogNotifyRecipientFilter[]).map((filter) => (
                    <label
                      key={filter}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-200 bg-white px-3 py-3"
                    >
                      <RadioGroupItem value={filter} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-cream-950">{RECIPIENT_FILTER_LABELS[filter].label}</p>
                          <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs font-medium text-cream-700">
                            {recipientSegments[filter]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-cream-600">{RECIPIENT_FILTER_LABELS[filter].description}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {verification ? (
                <div className="grid gap-3 rounded-lg bg-cream-50 p-3 text-sm text-cream-800 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cream-500">Recipients</p>
                    <p className="font-medium">{selectedRecipientCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cream-500">Estimated credits</p>
                    <p className="font-medium">
                      {computedEstimatedCredits}
                      {' '}
                      ({verification.whatsapp.credits_per_message}/msg)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cream-500">Balance</p>
                    <p className="font-medium">{verification.whatsapp.credits_balance}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cream-500">Est. cost</p>
                    <p className="font-medium">₹{computedEstimatedInr}</p>
                  </div>
                </div>
              ) : (
                <VerificationStatsSkeleton />
              )}

              <div className="space-y-1.5">
                <NotificationToggleRow
                  label="Send now"
                  description="Turn off to schedule the WhatsApp reminder."
                  checked={sendNow}
                  onCheckedChange={setSendNow}
                />
              </div>

              {!sendNow ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <DatePicker value={scheduledDate} onChange={setScheduledDate} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notify-schedule-time">Time</Label>
                    <Input id="notify-schedule-time" type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {whatsappBlockers.length > 0 ? (
            <div className="space-y-2">
              {whatsappBlockers.map((blocker) => (
                <div
                  key={blocker}
                  className="flex items-start gap-2 rounded-[10px] border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-800"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{blocker}</p>
                </div>
              ))}
            </div>
          ) : null}

          {verificationQuery.error instanceof Error ? (
            <Alert variant="danger">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not load WhatsApp verification</AlertTitle>
              <AlertDescription>{verificationQuery.error.message}</AlertDescription>
            </Alert>
          ) : null}

          {(isFirstPublish || isNotifyBuyers) && verification && !verification.whatsapp.feature_enabled ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>WhatsApp notify unavailable</AlertTitle>
              <AlertDescription>
                This tenant does not have WhatsApp broadcast enabled.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {!isPublishUpdates ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-cream-900">WhatsApp preview</p>
            <WhatsAppTemplatePreview
              sellerName={verification?.template.seller_name ?? 'Your business'}
              campaignTitle={campaign.name}
              buyerNote={buyerNote}
              sellerPhone={verification?.template.seller_phone_display ?? 'Your business number'}
              headerImageUrl={campaign.hero_image_url}
              footerText={verification?.template.footer_text ?? 'Powered by Yukti'}
              buttons={verification?.template.buttons}
            />
          </div>
        ) : (
          <div />
        )}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPublishing}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="accent"
          disabled={!canPublish || isPublishing}
          onClick={() => void onPublish({
            notifyWhatsapp: isFirstPublish && notifyWhatsapp && Boolean(verification?.whatsapp.feature_enabled),
            buyerNote,
            notifyScheduledFor: scheduledFor,
            heroImageUrl: campaign.hero_image_url,
            recipientFilter: isNotifyBuyers ? recipientFilter : undefined,
          })}
        >
          <Send size={14} />
          {submitLabel}
        </Button>
      </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

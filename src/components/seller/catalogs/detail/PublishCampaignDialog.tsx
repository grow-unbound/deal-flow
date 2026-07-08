'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Info, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NotificationToggleRow } from '@/components/seller/settings/NotificationToggleRow';
import { WhatsAppTemplatePreview } from '@/components/seller/catalogs/detail/WhatsAppTemplatePreview';
import type { CatalogPublishPreviewResponse } from '@/hooks/useCatalogs';

export type PublishCampaignDialogMode = 'first_publish' | 'publish_updates';

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

export interface PublishCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PublishCampaignDialogMode;
  preview?: CatalogPublishPreviewResponse;
  previewLoading: boolean;
  previewError: string | null;
  isPublishing: boolean;
  onNotifyWhatsappChange?: (enabled: boolean) => void;
  onPublish: (input: {
    notifyWhatsapp: boolean;
    buyerNote: string;
    notifyScheduledFor: string | null;
    heroImageUrl: string | null;
  }) => Promise<void>;
}

export function PublishCampaignDialog({
  open,
  onOpenChange,
  mode,
  preview,
  previewLoading,
  previewError,
  isPublishing,
  onNotifyWhatsappChange,
  onPublish,
}: PublishCampaignDialogProps) {
  const isFirstPublish = mode === 'first_publish';
  const openInitRef = useRef(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [buyerNote, setBuyerNote] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  useEffect(() => {
    if (!open) {
      openInitRef.current = false;
      return;
    }
    if (!preview || openInitRef.current) return;
    openInitRef.current = true;
    setBuyerNote(preview.campaign.buyer_note ?? '');
    setNotifyWhatsapp(isFirstPublish && preview.whatsapp.feature_enabled);
    setHeroImageUrl(preview.campaign.hero_image_url);
    setSendNow(true);
    setScheduledDate('');
    setScheduledTime('09:00');
  }, [open, preview, isFirstPublish]);

  const scheduledFor = useMemo(
    () => (sendNow ? null : combineScheduledAt(scheduledDate, scheduledTime)),
    [sendNow, scheduledDate, scheduledTime],
  );

  const whatsappBlockers = isFirstPublish && notifyWhatsapp ? (preview?.whatsapp.blockers ?? []) : [];
  const canPublish = !previewLoading
    && !previewError
    && Boolean(preview)
    && (!isFirstPublish || !notifyWhatsapp || whatsappBlockers.length === 0)
    && (sendNow || Boolean(scheduledFor));

  const effectiveHeaderImageUrl = heroImageUrl ?? preview?.campaign.header_image_url ?? null;
  const heroUrls = heroImageUrl ? [heroImageUrl] : [];

  function handleNotifyChange(checked: boolean) {
    setNotifyWhatsapp(checked);
    onNotifyWhatsappChange?.(checked);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{isFirstPublish ? 'Publish campaign' : 'Publish updates'}</DialogTitle>
          <DialogDescription>
            {isFirstPublish
              ? 'Review the campaign summary and notify eligible buyers on WhatsApp.'
              : 'Push campaign updates for eligible buyers. Publish updates does not send WhatsApp updates.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {previewLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-40 animate-pulse rounded bg-cream-100" />
                <div className="h-20 animate-pulse rounded bg-cream-100" />
              </div>
            ) : null}

            {previewError ? (
              <Alert variant="danger">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not load publish preview</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            ) : null}

            {preview ? (
              <>
                <div className="rounded-xl border border-cream-200 bg-cream-50 p-4">
                  <h3 className="text-lg font-semibold text-cream-950">{preview.campaign.name}</h3>
                  <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
                    <dt className="text-sm text-cream-600">Validity</dt>
                    <dd className="text-sm font-medium text-cream-900">
                      {formatValidity(preview.campaign.valid_from, preview.campaign.valid_to)}
                    </dd>
                    <dt className="text-sm text-cream-600">Audience</dt>
                    <dd className="text-sm font-medium text-cream-900">{preview.campaign.audience_label}</dd>
                    <dt className="text-sm text-cream-600">Products</dt>
                    <dd className="text-sm font-medium text-cream-900">{preview.campaign.products_count}</dd>
                    <dt className="text-sm text-cream-600">Pricing</dt>
                    <dd className="text-sm font-medium text-cream-900">{preview.campaign.pricing_scheme}</dd>
                  </dl>
                </div>

                {isFirstPublish ? (
                  <div className="space-y-1.5">
                    <Label>Campaign image</Label>
                    <p className="text-sm text-cream-600">800×418 recommended. JPG, PNG, WebP · Max 5MB.</p>
                    <BrowseUploadField
                      value={heroUrls}
                      onChange={(urls) => setHeroImageUrl(urls[0] ?? null)}
                      maxFiles={1}
                      previewInline
                      label="Browse image"
                      emptyLabel="Drop an image here or browse"
                      helperText="Uses campaign image, then logo, then platform default."
                      className="max-w-md"
                    />
                  </div>
                ) : null}

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

                {isFirstPublish && preview.whatsapp.feature_enabled ? (
                  <div className="space-y-4">
                    <NotificationToggleRow
                      label="Notify buyers on WhatsApp"
                      description="Sends the campaign_announcement template to opted-in buyers."
                      checked={notifyWhatsapp}
                      onCheckedChange={handleNotifyChange}
                    />

                    {notifyWhatsapp ? (
                      <>
                        <div className="grid gap-3 rounded-lg bg-cream-50 p-3 text-sm text-cream-800 sm:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-cream-500">Recipients</p>
                            <p className="font-medium">{preview.whatsapp.recipient_count}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-cream-500">Estimated credits</p>
                            <p className="font-medium">
                              {preview.whatsapp.estimated_credits}
                              {' '}
                              ({preview.whatsapp.credits_per_message}/msg)
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-cream-500">Balance</p>
                            <p className="font-medium">{preview.whatsapp.credits_balance}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-cream-500">Est. cost</p>
                            <p className="font-medium">₹{preview.whatsapp.estimated_inr}</p>
                          </div>
                        </div>

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
                              <Input id="schedule-time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                            </div>
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
                      </>
                    ) : null}
                  </div>
                ) : null}

                {isFirstPublish && !preview.whatsapp.feature_enabled ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>WhatsApp notify unavailable</AlertTitle>
                    <AlertDescription>
                      This tenant does not have WhatsApp broadcast enabled. Publishing will still create the share link.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            ) : null}
          </div>

          {preview && isFirstPublish ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-cream-900">WhatsApp preview</p>
              <WhatsAppTemplatePreview
                sellerName={preview.template.seller_name}
                campaignTitle={preview.campaign.name}
                buyerNote={buyerNote}
                sellerPhone={preview.template.seller_phone_display}
                headerImageUrl={effectiveHeaderImageUrl}
                footerText={preview.template.footer_text}
                buttons={preview.template.buttons}
              />
            </div>
          ) : null}
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
              notifyWhatsapp: isFirstPublish && notifyWhatsapp && Boolean(preview?.whatsapp.feature_enabled),
              buyerNote,
              notifyScheduledFor: scheduledFor,
              heroImageUrl,
            })}
          >
            <Send size={14} />
            {isPublishing
              ? 'Publishing…'
              : isFirstPublish
                ? (notifyWhatsapp ? 'Publish & notify' : 'Publish campaign')
                : 'Publish updates'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

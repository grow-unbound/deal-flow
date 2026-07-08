'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, MessageCircle, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [buyerNote, setBuyerNote] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  useEffect(() => {
    if (!open || !preview) return;
    setBuyerNote(preview.campaign.buyer_note ?? '');
    setNotifyWhatsapp(isFirstPublish && preview.whatsapp.feature_enabled);
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

  const sellerPhone = 'Your business number';

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
              ? 'Review the campaign summary and optionally notify opted-in buyers on WhatsApp.'
              : 'Push staged edits live for mapped buyers. WhatsApp rebroadcast is not sent on updates.'}
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
                <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 text-sm text-cream-800">
                  <p className="font-medium text-cream-900">{preview.campaign.name}</p>
                  <ul className="mt-2 space-y-1">
                    <li>Validity: {formatValidity(preview.campaign.valid_from, preview.campaign.valid_to)}</li>
                    <li>Audience: {preview.campaign.audience_label}</li>
                    <li>Products: {preview.campaign.products_count}</li>
                    <li>Pricing: {preview.campaign.pricing_scheme}</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-cream-900" htmlFor="buyer-note">
                    Note to buyers
                  </label>
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
                  <div className="space-y-4 rounded-xl border border-cream-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-cream-900">Notify buyers on WhatsApp</p>
                        <p className="text-xs text-cream-600">Sends the campaign_announcement template to opted-in buyers.</p>
                      </div>
                      <Switch checked={notifyWhatsapp} onCheckedChange={handleNotifyChange} />
                    </div>

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

                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-cream-900">Send now</p>
                            <p className="text-xs text-cream-600">Turn off to schedule the WhatsApp blast.</p>
                          </div>
                          <Switch checked={sendNow} onCheckedChange={setSendNow} />
                        </div>

                        {!sendNow ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-cream-900">Date</label>
                              <DatePicker value={scheduledDate} onChange={setScheduledDate} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-cream-900" htmlFor="schedule-time">Time</label>
                              <Input id="schedule-time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                            </div>
                          </div>
                        ) : null}

                        {whatsappBlockers.length > 0 ? (
                          <Alert variant="danger">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>WhatsApp notify blocked</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc pl-4">
                                {whatsappBlockers.map((blocker) => (
                                  <li key={blocker}>{blocker}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
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

                {isFirstPublish ? (
                  <Alert>
                    <MessageCircle className="h-4 w-4" />
                    <AlertTitle>Campaign image</AlertTitle>
                    <AlertDescription>
                      Header image uses campaign hero, then tenant logo, then platform default. Recommended 800×418 JPEG/PNG, max 5MB.
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
                sellerName="Your business"
                campaignTitle={preview.campaign.name}
                buyerNote={buyerNote}
                sellerPhone={sellerPhone}
                headerImageUrl={preview.campaign.header_image_url}
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

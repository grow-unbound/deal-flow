'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, MessageCircle, Search } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useDebounce } from '@/hooks/useDebounce';
import type { WhatsAppTemplateOption } from '@/hooks/useWhatsAppBroadcasts';
import { cn } from '@/lib/utils';
import { formatWhatsAppTemplateLabel } from '@/lib/whatsapp-ui';

function approvalLabel(status: WhatsAppTemplateOption['approval_status']) {
  if (status === 'approved') return 'Approved';
  if (status === 'pending') return 'Awaiting approval';
  if (status === 'rejected') return 'Rejected';
  return 'Disabled';
}

function approvalVariant(status: WhatsAppTemplateOption['approval_status']): 'default' | 'teal' | 'ember' | 'warning' | 'danger' {
  if (status === 'approved') return 'teal';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

export function BroadcastTemplatePickerOverlay({
  templates,
  selectedTemplate,
  isLoading,
  error,
  onSelect,
}: {
  templates: WhatsAppTemplateOption[];
  selectedTemplate: WhatsAppTemplateOption | null;
  isLoading: boolean;
  error: Error | null;
  onSelect: (template: WhatsAppTemplateOption) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<WhatsAppTemplateOption | null>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  const filteredTemplates = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    if (!normalized) return templates;
    return templates.filter((template) =>
      [
        template.use_case,
        template.meta_category,
        template.body,
        template.display_name,
        ...template.variables.map((variable) => variable.key),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [debouncedQuery, templates]);

  const triggerDescription = selectedTemplate
    ? `${selectedTemplate.meta_category} · ${approvalLabel(selectedTemplate.approval_status)}`
    : isLoading
      ? 'Loading templates…'
      : error
        ? 'Could not load templates'
        : templates.length === 0
          ? 'No templates available'
          : 'Pick from approved WhatsApp templates';

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={cn(
          'flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50',
          error ? 'border-danger-300 bg-danger-50/40' : '',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <MessageCircle size={14} className="shrink-0 text-cream-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-cream-900">
              {selectedTemplate ? formatWhatsAppTemplateLabel(selectedTemplate) : 'Select template'}
            </p>
            <p className="mt-0.5 text-sm text-cream-700">{triggerDescription}</p>
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <Sheet
        open={pickerOpen}
        onOpenChange={(next) => {
          setPickerOpen(next);
          if (!next) setQuery('');
        }}
      >
        <SheetContent side="right" className="flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white">
          <SheetHeader className="pr-12">
            <SheetTitle>Select a template</SheetTitle>
            <p className="mt-1.5 text-sm text-cream-700">
              Browse platform-managed WhatsApp templates, then open one to review the full copy and variables.
            </p>
          </SheetHeader>

          <SheetBody className="space-y-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates…"
                className="pl-8"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-[74px] animate-pulse rounded-[10px] bg-cream-100" />
                ))}
              </div>
            ) : error ? (
              <Alert variant="danger">
                <AlertTitle>Couldn&apos;t load templates</AlertTitle>
                <AlertDescription>
                  {error.message || 'There was a problem loading WhatsApp templates for this tenant.'}
                </AlertDescription>
              </Alert>
            ) : filteredTemplates.length === 0 ? (
              <Alert variant="warning">
                <AlertTitle>No templates available</AlertTitle>
                <AlertDescription>
                  {templates.length === 0
                    ? 'No platform-managed WhatsApp templates are available yet for this environment.'
                    : 'No templates match your search.'}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {filteredTemplates.map((template) => {
                  const isSelected = selectedTemplate?.id === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setDraftTemplate(template);
                        setDetailOpen(true);
                      }}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-[10px] border px-3 py-3 text-left transition-colors hover:bg-cream-50',
                        isSelected ? 'border-teal-300 bg-teal-50' : 'border-cream-300 bg-white',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-base font-medium text-cream-900">
                            {formatWhatsAppTemplateLabel(template)}
                          </p>
                          <Badge variant={template.meta_category === 'marketing' ? 'ember' : 'teal'} icon>
                            {template.meta_category}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-cream-700">{template.body}</p>
                        <p className="mt-1 text-xs text-cream-500">
                          {template.variables.length} variable{template.variables.length === 1 ? '' : 's'} · {approvalLabel(template.approval_status)}
                        </p>
                      </div>
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-cream-500" />
                    </button>
                  );
                })}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next) setDraftTemplate(null);
        }}
      >
        <SheetContent side="right" className="flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white">
          <SheetHeader className="pr-12">
            <SheetTitle>{draftTemplate ? formatWhatsAppTemplateLabel(draftTemplate) : 'Template details'}</SheetTitle>
            {draftTemplate ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={draftTemplate.meta_category === 'marketing' ? 'ember' : 'teal'} icon>
                  {draftTemplate.meta_category}
                </Badge>
                <Badge variant={approvalVariant(draftTemplate.approval_status)} icon>
                  {approvalLabel(draftTemplate.approval_status)}
                </Badge>
              </div>
            ) : null}
          </SheetHeader>

          <SheetBody className="space-y-4">
            {draftTemplate ? (
              <>
                <section className="rounded-[10px] border border-cream-300 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Message body</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.6] text-cream-900">{draftTemplate.body}</p>
                </section>

                <section className="rounded-[10px] border border-cream-300 bg-cream-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">Variables</p>
                  {draftTemplate.variables.length === 0 ? (
                    <p className="mt-2 text-sm text-cream-700">This template does not require any variable values.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {draftTemplate.variables.map((variable) => (
                        <div key={variable.key} className="rounded-[8px] border border-cream-200 bg-white px-3 py-2">
                          <p className="text-sm font-medium text-cream-900">{variable.key}</p>
                          <p className="mt-0.5 text-sm text-cream-700">
                            {variable.description ?? 'Provide this value when saving the broadcast draft.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {draftTemplate.meta_category === 'marketing' ? (
                  <Alert variant="info">
                    <AlertTitle>Marketing template</AlertTitle>
                    <AlertDescription>
                      Audience preview may exclude recipients who already received a marketing message recently or have opted out.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            ) : null}
          </SheetBody>

          <SheetFooter className="justify-end gap-2">
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>Back</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!draftTemplate) return;
                onSelect(draftTemplate);
                setDetailOpen(false);
                setPickerOpen(false);
              }}
            >
              <Check size={14} /> Use template
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

'use client';

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { InboxInlineNote } from './InboxInlineNote';

export const REMIND_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

type NoteProps = Parameters<typeof InboxInlineNote>[0];

/**
 * Desktop: the note editor appears inline under the actions (there's room, and it's in view).
 * Mobile: the actions live in a pinned footer, so an inline editor would open off-screen
 * below/inside it -- show it in a bottom sheet the user can't miss instead.
 */
export function InboxNoteHost(props: NoteProps) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <InboxInlineNote {...props} />;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px]">
        <SheetHeader>
          <SheetTitle>Add note</SheetTitle>
        </SheetHeader>
        <SheetBody className="max-h-[70dvh] pb-8">
          <InboxInlineNote {...props} open />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** Mobile "Remind later" picker as a bottom sheet (desktop keeps its inline/hover pickers). */
export function InboxRemindSheet({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (days: number) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px]">
        <SheetHeader>
          <SheetTitle>Remind later</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-2 pb-8">
          {REMIND_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => { onOpenChange(false); onPick(option.days); }}
              className="flex w-full items-center rounded-[12px] border border-cream-200 px-4 py-3 text-left text-base font-medium text-cream-900 active:bg-cream-100"
            >
              {option.label}
            </button>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

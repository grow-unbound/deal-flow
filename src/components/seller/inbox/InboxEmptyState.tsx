import { CheckCircle2 } from 'lucide-react';

export function InboxEmptyState({ tab }: { tab: 'active' | 'resolved' }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <CheckCircle2 className="h-8 w-8 text-cream-400" aria-hidden />
      <p className="text-base font-medium text-cream-800">
        {tab === 'active' ? "You're all caught up" : 'Nothing resolved yet'}
      </p>
      <p className="max-w-xs text-sm text-cream-500">
        {tab === 'active'
          ? 'New activity from your buyers will show up here as it happens.'
          : 'Items you resolve or that resolve on their own will collect here.'}
      </p>
    </div>
  );
}

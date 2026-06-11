import { PageWrap } from '@/components/seller/layout';

export default function SettingsIntegrationsLoading() {
  return (
    <PageWrap className="space-y-6">
      <div className="space-y-2" role="status" aria-label="Loading integrations settings">
        <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-cream-100 bg-cream-50" />
    </PageWrap>
  );
}

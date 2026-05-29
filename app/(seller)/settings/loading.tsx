import { PageWrap } from '@/components/seller/layout';

export default function SettingsLoading() {
  return (
    <PageWrap className="space-y-6">
      <div className="space-y-6" role="status" aria-label="Loading settings page">
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
          <div className="h-8 w-56 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-cream-200" />
        </div>

        <div className="rounded-lg border border-cream-200 bg-cream-50 p-8">
          <div className="mx-auto h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mx-auto mt-4 h-8 w-44 animate-pulse rounded bg-cream-200" />
          <div className="mx-auto mt-4 h-4 w-72 max-w-full animate-pulse rounded bg-cream-200" />
        </div>
      </div>
    </PageWrap>
  );
}

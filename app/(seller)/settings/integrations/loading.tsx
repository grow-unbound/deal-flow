export default function SettingsIntegrationsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6">
      <div className="space-y-2" role="status" aria-label="Loading integrations settings">
        <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
    </div>
  );
}

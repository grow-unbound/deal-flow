export default function ActivateLoading() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="h-5 w-44 rounded bg-cream-200 animate-pulse" />
        <div className="h-4 w-64 rounded bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-11 w-full rounded bg-cream-200 animate-pulse" />
        <div className="h-11 w-full rounded bg-cream-200 animate-pulse" />
      </div>
    </div>
  );
}

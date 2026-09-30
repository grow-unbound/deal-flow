/** Body heading for a stacked (mobile) entry screen: what this entry is, plus its one-line detail. */
export function InboxEntryHeading({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.015em] text-cream-900">{title}</h2>
      {subtitle ? <p className="mt-1 text-base text-cream-600">{subtitle}</p> : null}
    </div>
  );
}

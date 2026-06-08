type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInvoicePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-[1920px] w-full px-8 py-6">
      <h1 className="font-display text-xl text-cream-900">Edit invoice</h1>
      <p className="mt-2 font-sans text-sm text-cream-700">
        Composer for invoice <span className="font-mono text-cream-800">{id}</span> is not wired on this route yet.
      </p>
    </div>
  );
}

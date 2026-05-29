interface OrderDetailStubPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailStubPage({ params }: OrderDetailStubPageProps) {
  const { id } = await params;

  return (
    <div className="px-8 py-6">
      <h1 className="font-display text-[28px] font-semibold text-cream-950">Order {id}</h1>
      <p className="mt-2 text-[13px] text-cream-700">Order detail page is scaffolded and will be implemented in a dedicated story.</p>
    </div>
  );
}

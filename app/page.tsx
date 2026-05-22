export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-slate-900 mb-6">DealFlow</h1>
          <p className="text-xl text-slate-700 mb-8">
            Distributor command center: manage multibrand catalogs, publish cohort-specific pricing to retailers, capture orders via buyer PWA.
          </p>
          <div className="bg-white rounded-lg shadow-lg p-8 text-left">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Setup Status</h2>
            <ul className="space-y-3 text-slate-700">
              <li className="flex items-center">
                <span className="text-green-600 mr-3">✓</span>
                Project scaffolding initialized
              </li>
              <li className="flex items-center">
                <span className="text-green-600 mr-3">✓</span>
                Next.js App Router configured
              </li>
              <li className="flex items-center">
                <span className="text-green-600 mr-3">✓</span>
                TypeScript, Tailwind, shadcn/ui ready
              </li>
              <li className="flex items-center">
                <span className="text-yellow-600 mr-3">⏳</span>
                Supabase schemas & migrations (Week 1)
              </li>
              <li className="flex items-center">
                <span className="text-yellow-600 mr-3">⏳</span>
                Auth & tenant routing (Week 1)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}

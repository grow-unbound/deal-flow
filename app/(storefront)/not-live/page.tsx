import { headers } from 'next/headers';
import { getTenantBrandingBySlug } from '@/lib/server/tenant-branding';
import { TenantLogo } from '@/components/brand/TenantLogo';
import { buildWhatsAppChatUrl } from '@/constants/auth-login-copy';

export default async function PublicCatalogNotLivePage() {
  const headerList = await headers();
  const slug = headerList.get('x-verified-tenant-slug');
  const branding = slug ? await getTenantBrandingBySlug(slug) : null;
  const tenantName = branding?.businessName ?? 'This distributor';

  const contactHref = branding?.whatsappNumber
    ? buildWhatsAppChatUrl(
        branding.whatsappNumber,
        `Hi, I'd like to know when your Yukti catalog will be live.`,
      )
    : null;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-cream-50 p-6">
      <div className="w-full max-w-md rounded-[20px] border border-cream-200 bg-white px-8 py-10 text-center">
        {branding && (
          <div className="mb-5 flex justify-center">
            <TenantLogo name={tenantName} logoUrl={branding.logoUrl} size={64} />
          </div>
        )}
        <h1 className="text-xl font-semibold text-[#221E1A]">
          {branding ? `${tenantName}'s catalog isn't live on Yukti yet` : 'Catalog is not live yet'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-cream-800">
          {branding
            ? `${tenantName} hasn't published their catalog here yet. Check back soon, or reach out to them directly.`
            : 'This distributor has not published a public catalog. Check back later or use the link they shared with you.'}
        </p>
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-teal-500 px-4 py-2.5 text-body-sm font-semibold text-cream-50 transition-colors duration-base hover:bg-teal-600"
          >
            Contact {tenantName} on WhatsApp
          </a>
        )}
      </div>
    </main>
  );
}

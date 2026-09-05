import { notFound } from 'next/navigation';

/**
 * Reached only via middleware rewrite when a tenant host's slug doesn't
 * resolve to any real tenant. Renders a real 404 (root not-found.tsx) rather
 * than the "catalog not live yet" message a real-but-dormant tenant gets —
 * otherwise every unregistered subdomain looks identical to a genuine one
 * that just hasn't published, which is a free oracle for slug-scraping.
 */
export default function TenantNotFoundPage() {
  notFound();
}

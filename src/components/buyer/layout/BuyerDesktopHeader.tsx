'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleHelp, LogOut, ReceiptText, Repeat, Search, ShoppingCart, User } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useBuyerSession } from '@/hooks/useBuyerSession';
import { useAuth } from '@/contexts/AuthContext';
import { apiPost } from '@/lib/api-fetch';
import { BuyerLocationControl } from '@/components/buyer/layout/BuyerLocationControl';
import { BuyerDesktopCartDrawer } from '@/components/buyer/layout/BuyerDesktopCartDrawer';
import { useCart } from '@/contexts/BuyerCartContext';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { cn } from '@/lib/utils';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

function getInitials(value: string | null | undefined) {
  const parts = (value ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'BY';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? 'BY').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function formatRoleLabel(role: string | null | undefined) {
  if (role === 'buyer_admin') return 'Buyer admin';
  if (role === 'buyer_assistant') return 'Buyer assistant';
  return 'Buyer';
}

function DesktopHeaderAction({
  href,
  label,
  icon,
  badge,
  active = false,
  onClick,
  ariaLabel,
}: {
  href?: string;
  label: string;
  icon: ReactNode;
  badge?: string | number | null;
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const content = (
    <span
      className={cn(
        'relative inline-flex flex-col items-center justify-center gap-1 rounded-[10px] px-2.5 py-1.5 text-center transition-colors',
        active ? 'bg-cream-100 text-cream-950' : 'text-cream-800 hover:bg-cream-100',
      )}
    >
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        {icon}
        {badge ? (
          <span className="absolute -right-2.5 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[length:var(--b-text-eyebrow)] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[length:var(--b-text-eyebrow)] font-medium leading-none">{label}</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel ?? label} className="shrink-0">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className="shrink-0">
      {content}
    </button>
  );
}

export function BuyerDesktopHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me, isLoading: isBuyerLoading } = useBuyerMe();
  const { effectiveBuyerRole } = useBuyerSession();
  const { items } = useCart();
  const { signOut } = useAuth();
  const [switchPending, setSwitchPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const userName = me?.business_name || 'Buyer';
  const sessionPersonName = me?.session_person_name?.trim() || null;
  const popoverSupportingText = [formatRoleLabel(effectiveBuyerRole), sessionPersonName].filter(Boolean).join(' · ');
  const tenantName = me?.tenant.name || 'Tenant';
  const tenantLogoUrl = me?.tenant.logo_url ?? null;
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartDrawerOpen = searchParams?.get('cart') === 'open';
  const cartActive = pathname === '/buy/cart' || cartDrawerOpen;
  const cartBadge = cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : null;
  const searchHref = useMemo(() => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('cart');
    const query = next.toString();
    return query ? `/buy/search?${query}` : '/buy/search';
  }, [searchParams]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable === true;
      if (isEditable) return;
      const isSearchShortcut = (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || event.key.toLowerCase() === 'f';
      if (!isSearchShortcut) return;
      event.preventDefault();
      router.push(searchHref);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [router, searchHref]);

  async function handleSwitchAccount() {
    setSwitchPending(true);
    try {
      const res = await apiPost('/api/auth/switch-context', {});
      const body = await res.json();
      if (!res.ok || !body.contexts || !body.ref_id) {
        toast.error(body.error ?? 'No other accounts linked to this number.');
        return;
      }
      sessionStorage.setItem(SESSION_CONTEXTS_KEY, JSON.stringify(body.contexts));
      router.push(`/login/select-context?ref_id=${encodeURIComponent(body.ref_id)}`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSwitchPending(false);
    }
  }

  async function handleLogout() {
    setLogoutPending(true);
    try {
      await signOut();
    } catch {
      toast.error('Failed to log out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  }

  function handleHelp() {
    if (!me?.support_whatsapp_number) {
      toast.error('Support is not configured yet.');
      return;
    }
    window.open(`https://wa.me/${me.support_whatsapp_number.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  }

  function openCartOverlay() {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.set('cart', 'open');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function closeCartOverlay(open: boolean) {
    if (open) return;
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('cart');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <>
      <header className="sticky top-0 z-20 hidden border-b border-cream-200 bg-[var(--cream-50)] md:block">
        <div
          className="mx-auto grid min-h-[64px] w-full grid-cols-[auto_minmax(280px,1fr)_auto] items-center gap-4 px-5 py-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,760px)_auto]"
          style={{ maxWidth: BUYER_PREVIEW_MAX_WIDTH }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {isBuyerLoading ? (
              <div
                className="h-8 w-24 shrink-0 animate-pulse rounded-[8px] bg-cream-200"
                aria-label="Loading tenant logo"
              />
            ) : tenantLogoUrl ? (
              <Link href="/buy/catalog" className="flex h-8 w-24 shrink-0 items-center justify-start">
                <Image src={tenantLogoUrl} alt={tenantName} width={96} height={32} className="h-8 w-auto max-w-24 object-contain object-left" unoptimized />
              </Link>
            ) : (
              <Link href="/buy/catalog" className="shrink-0 text-[length:var(--b-text-label)] font-semibold text-cream-950">
                {tenantName}
              </Link>
            )}

            <span className="h-5 w-px shrink-0 bg-cream-200" aria-hidden />

            <Link href="/buy/catalog" className="flex h-6 w-6 shrink-0 items-center justify-center opacity-70 transition-opacity hover:opacity-100" aria-label="Yukti">
              <YuktiLogo variant="mark" className="h-6 w-6" priority />
            </Link>

            <BuyerLocationControl variant="desktop" className="min-w-0 shrink self-center" />
          </div>

          <div className="flex min-w-0 justify-center">
            <button
              type="button"
              onClick={() => router.push(searchHref)}
              className="flex h-10 w-full min-w-0 max-w-[760px] items-center gap-3 rounded-[12px] border border-cream-300 bg-[var(--cream-50)] px-4 text-cream-500 transition-colors hover:border-cream-400"
            >
              <Search className="h-4 w-4" />
              <span className="truncate text-[length:var(--b-text-sub)]">Search products, SKU, brand…</span>
              <span className="ml-auto hidden rounded-[8px] border border-cream-200 bg-cream-50 px-2 py-0.5 text-[length:var(--b-text-eyebrow)] font-medium text-cream-600 lg:inline-flex">
                Ctrl/Cmd+K
              </span>
            </button>
          </div>

          <div className="flex min-w-0 justify-self-end">
            <div className="flex shrink-0 items-center gap-1">
            <DesktopHeaderAction
              href="/buy/orders"
              label="Orders"
              icon={<ReceiptText className="h-5 w-5" />}
              active={pathname === '/buy/orders'}
            />

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0"
                  aria-label={`Open account menu for ${userName}`}
                >
                  <span className="inline-flex flex-col items-center justify-center gap-1 rounded-[10px] px-2.5 py-1.5 text-center text-cream-800 transition-colors hover:bg-cream-100">
                    <span className="relative inline-flex h-5 w-5 items-center justify-center">
                      <User className="h-5 w-5" />
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[length:var(--b-text-eyebrow)] font-medium leading-none">
                      Profile
                      <ChevronDown className="h-3 w-3 text-cream-500" />
                    </span>
                  </span>
                </button>
              </PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} className="w-[22rem] rounded-[18px] border border-cream-200 bg-cream-50 p-0 shadow-xl">
              <div className="border-b border-cream-200 px-4 py-4">
                <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border border-cream-200">
                    <AvatarFallback>{getInitials(me?.business_name || me?.contact_name || me?.greeting_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[length:var(--b-text-body)] font-semibold leading-5 text-[var(--fg-1)]">{userName}</p>
                    <p className="mt-1 text-[length:var(--b-text-sub)] font-medium text-cream-600">
                      {popoverSupportingText || tenantName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3">
                <Button asChild variant="ghost" className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100">
                  <Link href="/buy/profile">
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                </Button>
                <Button variant="ghost" className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleHelp}>
                  <CircleHelp className="h-4 w-4" />
                  Help
                </Button>
                <Button variant="ghost" className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleSwitchAccount} disabled={switchPending}>
                  <Repeat className="h-4 w-4" />
                  {switchPending ? 'Switching…' : 'Switch Account'}
                </Button>
                <Button variant="ghost" className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleLogout} disabled={logoutPending}>
                  <LogOut className="h-4 w-4" />
                  {logoutPending ? 'Logging out…' : 'Logout'}
                </Button>
              </div>
            </PopoverContent>
            </Popover>

            <DesktopHeaderAction
              label="Cart"
              icon={<ShoppingCart className="h-5 w-5" />}
              badge={cartBadge}
              active={cartActive}
              onClick={openCartOverlay}
              ariaLabel="Open cart"
            />
            </div>
          </div>
        </div>
      </header>
      <BuyerDesktopCartDrawer open={cartDrawerOpen} onOpenChange={closeCartOverlay} />
    </>
  );
}

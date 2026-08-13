'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleHelp, LogOut, ReceiptText, Repeat, Search, ShoppingCart, User } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { useIsFetching } from '@tanstack/react-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useBuyerSession } from '@/hooks/useBuyerSession';
import { useAuth } from '@/contexts/AuthContext';
import { apiPost } from '@/lib/api-fetch';
import { BuyerLocationControl } from '@/components/buyer/layout/BuyerLocationControl';
import { BuyerDesktopCartDrawer } from '@/components/buyer/layout/BuyerDesktopCartDrawer';
import { useCart } from '@/contexts/BuyerCartContext';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { triggerHaptic } from '@/lib/haptics';
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

function DesktopIconAction({
  href,
  ariaLabel,
  icon,
  badge,
  active = false,
  onClick,
}: {
  href?: string;
  ariaLabel: string;
  icon: ReactNode;
  badge?: string | number | null;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <span
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors duration-fast',
        active ? 'bg-cream-100 text-cream-950' : 'text-cream-800 hover:bg-[var(--yk-hover-tint)] hover:text-cream-950',
      )}
    >
      {icon}
      {badge ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[length:var(--b-text-eyebrow)] font-semibold leading-4 text-white">
          {badge}
        </span>
      ) : null}
    </span>
  );

  function handlePointerDown() {
    triggerHaptic('light');
  }

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className="shrink-0" onPointerDown={handlePointerDown}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={handlePointerDown}
      aria-label={ariaLabel}
      className="shrink-0"
    >
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

  const isOnSearchPage = pathname === '/buy/search';
  const [searchInput, setSearchInput] = useState(() => (isOnSearchPage ? (searchParams?.get('q') ?? '') : ''));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFetching = useIsFetching({ queryKey: ['buyer-catalog-search-text'] }) > 0;

  useEffect(() => {
    setSearchInput(pathname === '/buy/search' ? (searchParams?.get('q') ?? '') : '');
  }, [pathname, searchParams]);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  function handleSearchInputChange(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const next = new URLSearchParams();
      if (value.trim()) next.set('q', value.trim());
      const query = next.toString();
      const href = query ? `/buy/search?${query}` : '/buy/search';
      if (pathname === '/buy/search') {
        router.replace(href);
      } else {
        router.push(href);
      }
    }, 280);
  }

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
      searchInputRef.current?.focus();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

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
          <div className="flex min-w-0 items-center gap-1.5">
            {isBuyerLoading ? (
              <div
                className="h-[3.25rem] w-16 shrink-0 animate-pulse rounded-[8px] bg-cream-200"
                aria-label="Loading tenant logo"
              />
            ) : tenantLogoUrl ? (
              <Link href="/buy/catalog" className="flex h-[3.25rem] w-16 shrink-0 items-center justify-start">
                <Image src={tenantLogoUrl} alt={tenantName} width={64} height={52} className="h-[3.25rem] w-auto max-w-16 object-contain object-left" unoptimized />
              </Link>
            ) : (
              <Link href="/buy/catalog" className="shrink-0 text-[length:var(--b-text-label)] font-semibold text-cream-950">
                {tenantName}
              </Link>
            )}

            <span className="h-5 w-px shrink-0 bg-cream-200" aria-hidden />

            <BuyerLocationControl variant="desktop" className="min-w-0 shrink self-center" />
          </div>

          <div className="flex min-w-0 justify-center">
            <div className="flex h-11 w-full min-w-0 max-w-[760px] items-center gap-3 rounded-[12px] border border-cream-300 bg-[var(--cream-50)] px-4 text-cream-500 transition-colors hover:border-cream-400 focus-within:border-cream-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-ember-400/20">
              {searchFetching ? <Spinner size="sm" className="shrink-0 text-cream-500" /> : <Search className="h-4 w-4 shrink-0" />}
              <input
                ref={searchInputRef}
                type="search"
                value={searchInput}
                onChange={(event) => handleSearchInputChange(event.target.value)}
                placeholder="Search products, SKU, brand…"
                className="min-w-0 flex-1 bg-transparent text-[length:var(--b-text-sub)] text-cream-950 outline-none placeholder:text-cream-500"
                aria-label="Search products"
              />
              <span className="ml-auto hidden shrink-0 rounded-[8px] border border-cream-200 bg-cream-50 px-2 py-0.5 text-[length:var(--b-text-eyebrow)] font-medium text-cream-600 lg:inline-flex">
                Ctrl/Cmd+K
              </span>
            </div>
          </div>

          <div className="flex min-w-0 justify-self-end">
            <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/buy/orders"
              onPointerDown={() => triggerHaptic('light')}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-[12px] px-3 text-[length:var(--b-text-body)] font-medium transition-colors duration-fast',
                pathname === '/buy/orders' ? 'bg-cream-100 text-cream-950' : 'text-cream-800 hover:bg-[var(--yk-hover-tint)] hover:text-cream-950',
              )}
            >
              <ReceiptText className="h-5 w-5" />
              Orders
            </Link>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onPointerDown={() => triggerHaptic('light')}
                  className="shrink-0"
                  aria-label={`Open account menu for ${userName}`}
                >
                  <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors duration-fast hover:bg-[var(--yk-hover-tint)]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cream-300 text-cream-800">
                      <User className="h-4 w-4" />
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
                <PopoverClose asChild>
                  <Button asChild variant="ghost" haptic className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100">
                    <Link href="/buy/profile">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button variant="ghost" haptic className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleHelp}>
                    <CircleHelp className="h-4 w-4" />
                    Help
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button variant="ghost" haptic className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleSwitchAccount} disabled={switchPending}>
                    <Repeat className="h-4 w-4" />
                    {switchPending ? 'Switching…' : 'Switch Account'}
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button variant="ghost" haptic className="h-11 w-full justify-start rounded-[12px] text-[var(--fg-1)] hover:bg-cream-100" onClick={handleLogout} disabled={logoutPending}>
                    <LogOut className="h-4 w-4" />
                    {logoutPending ? 'Logging out…' : 'Logout'}
                  </Button>
                </PopoverClose>
              </div>
            </PopoverContent>
            </Popover>

            <DesktopIconAction
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

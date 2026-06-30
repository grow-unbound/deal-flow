'use client';

import { Bell, ChevronDown, ExternalLink, LogOut, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GlobalSearchOverlay } from '@/components/seller/layout/GlobalSearchOverlay';
import { SellerNotificationDrawer } from '@/components/layout/SellerNotificationDrawer';
import { useAuth } from '@/contexts/AuthContext';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';
import { useTenant } from '@/contexts/TenantContext';
import { useRole } from '@/hooks/useRole';

function NotificationsBell({ unreadCount, onClick }: { unreadCount: number; onClick: () => void }) {
  const showBadge = unreadCount > 0;
  const label = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-cream-800 transition-colors duration-fast hover:bg-[var(--yk-hover-tint)] hover:text-[#221E1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
      aria-label="Notifications"
    >
      <Bell size={16} strokeWidth={2} />
      {showBadge ? (
        <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-ember-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {label}
        </span>
      ) : null}
    </button>
  );
}

function getInitials(value: string | null | undefined) {
  const parts = (value ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

interface SellerGlobalHeaderProps {
  tenantBranding: {
    tenantName: string;
    tenantLogoUrl: string | null;
  };
}

export function SellerGlobalHeader({ tenantBranding }: SellerGlobalHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount } = useSellerRealtimeContext();
  const { user, signOut } = useAuth();
  const { currentTenant } = useTenant();
  const { isSellerAdmin, isSellerAssistant } = useRole();

  const tenantName = tenantBranding.tenantName || currentTenant?.business_name || 'Tenant';
  const tenantLogoUrl = tenantBranding.tenantLogoUrl;
  const userName = user?.displayName ?? user?.email ?? 'Team member';
  const userEmail = user?.email ?? '—';
  const userPhone = user?.phone ?? '—';
  const sellerRoleLabel = isSellerAdmin ? 'Admin' : isSellerAssistant ? 'Assistant' : 'Seller';

  async function handleLogout() {
    await signOut();
  }

  return (
    <>
      <header
        className="fixed right-0 top-0 z-20 flex h-16 items-center gap-4 border-b border-cream-300 bg-[var(--bg-surface)] px-9"
        style={{ left: 'var(--sidebar-w)' }}
      >
        <GlobalSearchOverlay className="max-w-[min(50vw,40rem)] flex-[1_1_0%]" />

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" className="h-11 rounded-[12px] px-3 text-cream-800 hover:text-[#221E1A]">
            <a href="/api/buyer/preview/launch" target="_blank" rel="noreferrer">
              Open Buyer App <ExternalLink size={14} />
            </a>
          </Button>

          <NotificationsBell unreadCount={unreadCount} onClick={() => setDrawerOpen(true)} />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-[12px] px-2 pr-2 text-left transition-colors duration-fast hover:bg-[var(--yk-hover-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
                aria-label={`Open account menu for ${userName}`}
              >
                <Avatar size="md" className="h-9 w-9">
                  {tenantLogoUrl ? <AvatarImage src={tenantLogoUrl} alt={tenantName} /> : null}
                  <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                </Avatar>
                <ChevronDown size={14} strokeWidth={2} className="text-cream-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} className="w-[22rem] rounded-[16px] border border-cream-300 bg-cream-50 p-0 shadow-xl">
              <div className="border-b border-cream-200 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg" className="h-12 w-12">
                    {tenantLogoUrl ? <AvatarImage src={tenantLogoUrl} alt={tenantName} /> : null}
                    <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold leading-5 text-[#221E1A]">{userName}</p>
                    <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.08em] text-cream-600">
                      {sellerRoleLabel} · {tenantName}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1 px-4 py-4">
                <div className="flex items-start gap-3 rounded-[12px] px-3 py-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-100 text-cream-700">
                    <Phone size={14} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-500">Phone</p>
                    <p className="truncate text-[14px] font-medium text-[#221E1A]">{userPhone}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[12px] px-3 py-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-100 text-cream-700">
                    <Mail size={14} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-500">Email</p>
                    <p className="truncate text-[14px] font-medium text-[#221E1A]">{userEmail}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-cream-200 p-3">
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start rounded-[12px] text-[#221E1A] hover:bg-cream-100"
                  onClick={handleLogout}
                  haptic
                >
                  <LogOut size={16} strokeWidth={2} />
                  Logout
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <SellerNotificationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

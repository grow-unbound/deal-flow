'use client';

import { formatNumberValue } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Check, ChevronRight, HelpCircle, LogOut, Phone, Repeat, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { formatWhatsappDestination } from '@/lib/phone';
import { useBuyerMe, type BuyerMeData } from '@/hooks/useBuyerMe';
import { useBuyerSession } from '@/hooks/useBuyerSession';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { catalogOriginForRequest } from '@/lib/storefront-host';

interface BuyerInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

interface BuyerInvoicesResponse {
  invoices: BuyerInvoice[];
}

type BuyerRole = 'buyer_admin' | 'buyer_assistant' | null;

function formatShortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function normalizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

function formatRoleLabel(role: BuyerRole): string {
  if (role === 'buyer_admin') return 'Buyer admin';
  if (role === 'buyer_assistant') return 'Buyer assistant';
  return 'Buyer';
}

function RowIcon({
  icon,
  tone = 'default',
}: {
  icon: React.ReactNode;
  tone?: 'default' | 'accent' | 'danger';
}) {
  const toneClasses = tone === 'accent'
    ? 'bg-amber-50 text-amber-800'
    : tone === 'danger'
      ? 'bg-red-50 text-red-700'
      : 'bg-cream-100 text-cream-700';

  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] ${toneClasses}`}>
      {icon}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{label}</p>
      <p className={mono ? 'font-mono text-base text-cream-900' : 'text-base text-cream-900'}>{value}</p>
    </div>
  );
}

function InlineField({
  label,
  value,
  onChange,
  maxLength,
  mono = false,
  uppercase = false,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  mono?: boolean;
  uppercase?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(uppercase ? event.target.value.toUpperCase() : event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`h-11 rounded-[12px] border-cream-300 bg-white px-4 text-base text-cream-900 ${mono ? 'font-mono' : ''}`}
      />
      {hint ? <span className="block text-sm text-cream-600">{hint}</span> : null}
    </label>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onClick,
  action,
  tone,
  mono = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  action?: React.ReactNode;
  tone?: 'default' | 'accent' | 'danger';
  mono?: boolean;
}) {
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`flex w-full items-center gap-4 px-4 py-4 text-left transition-colors ${
        interactive ? 'hover:bg-cream-100/70 active:bg-cream-100' : 'cursor-default'
      } disabled:opacity-100`}
    >
      <RowIcon icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight text-cream-900" style={{ fontSize: 'var(--b-text-body)' }}>{title}</div>
        <div className={`mt-1 leading-5 text-cream-600 ${mono ? 'font-mono' : ''}`} style={{ fontSize: 'var(--b-text-sub)' }}>{subtitle}</div>
      </div>
      {action}
    </button>
  );
}

function SheetField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-semibold uppercase text-cream-600" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em' }}>{label}</p>
      {children}
      {hint ? <p className="text-cream-600" style={{ fontSize: 'var(--b-text-sub)' }}>{hint}</p> : null}
    </div>
  );
}

function ProfileSheetFrame({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={`flex max-h-[calc(100vh-20px)] flex-col overflow-hidden rounded-t-[20px] border-0 bg-[#fcf8f2] p-0 shadow-[0_-24px_60px_rgba(23,36,31,0.18)] ${className ?? ''}`}
      >
        <div className="flex justify-center px-5 pb-4 pt-4">
          <div className="h-1.5 w-16 rounded-full bg-[#ddd2c1]" />
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

function BuyerSheetPhoneInput({
  value,
  onChange,
  placeholder = '9876543210',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex h-[var(--ctl-h-input)] items-stretch overflow-hidden rounded-[12px] border border-cream-300 bg-white transition-colors duration-fast ease-standard focus-within:border-ember-400 focus-within:ring-2 focus-within:ring-ember-400/20">
      <span className="inline-flex items-center border-r border-cream-300 bg-[#f6efe4] px-4 font-medium text-cream-700" style={{ fontSize: 'var(--b-text-body)' }}>
        +91
      </span>
      <input
        inputMode="numeric"
        type="tel"
        value={value}
        onChange={(e) => onChange(normalizePhoneInput(e.target.value))}
        maxLength={10}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent px-4 font-sans text-cream-900 placeholder:text-cream-500 focus:outline-none focus:ring-0"
        style={{ fontSize: 'var(--b-text-body)' }}
      />
    </div>
  );
}

function BusinessDetailsSheet({
  open,
  onOpenChange,
  data,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BuyerMeData;
  pending: boolean;
  onSave: (payload: { business_name: string; contact_name: string; gstin: string }) => void;
}) {
  const [businessName, setBusinessName] = useState(data.business_name);
  const [contactName, setContactName] = useState(data.contact_name);
  const [gstin, setGstin] = useState(data.gstin ?? '');

  useEffect(() => {
    if (open) {
      setBusinessName(data.business_name);
      setContactName(data.contact_name);
      setGstin(data.gstin ?? '');
    }
  }, [open, data.business_name, data.contact_name, data.gstin]);

  return (
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[44dvh]">
      <SheetHeader className="border-b border-cream-200 px-5 pb-4 pt-0">
        <SheetTitle className="font-display font-semibold leading-[1.02] tracking-[-0.025em] text-cream-950" style={{ fontSize: 'var(--b-text-page)', fontFamily: 'var(--font-display)' }}>
          Edit business details
        </SheetTitle>
        <p className="mt-3 max-w-[32rem] leading-6 text-cream-700" style={{ fontSize: 'var(--b-text-body)' }}>
          These details appear on every order placed and on invoices issued by your distributors.
        </p>
      </SheetHeader>
      <SheetBody className="space-y-5 px-[22px] py-5">
        <SheetField label="Business name">
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={200}
            className="rounded-[12px] border-cream-300 bg-white px-4" style={{ fontSize: 'var(--b-text-body)' }}
          />
        </SheetField>
        <SheetField label="Contact name">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={200}
            className="rounded-[12px] border-cream-300 bg-white px-4" style={{ fontSize: 'var(--b-text-body)' }}
          />
        </SheetField>
        <SheetField label="GSTIN" hint="Leave blank if your business is not GST registered.">
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
            className="rounded-[12px] border-cream-300 bg-white px-4" style={{ fontSize: 'var(--b-text-body)' }}
          />
        </SheetField>
      </SheetBody>
      <SheetFooter className="gap-3 border-t border-cream-300 bg-cream-50 px-[22px] pb-[calc(14px+env(safe-area-inset-bottom,0px))] pt-[14px]">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1 rounded-[12px] border-cream-300 bg-white" style={{ fontSize: 'var(--b-text-body)' }}
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          className="flex-1 rounded-[12px]" style={{ fontSize: 'var(--b-text-body)' }}
          onClick={() => onSave({ business_name: businessName, contact_name: contactName, gstin })}
          disabled={pending}
        >
          {pending ? <Spinner size="sm" className="text-current" /> : <Check className="h-5 w-5" />}
          Save changes
        </Button>
      </SheetFooter>
    </ProfileSheetFrame>
  );
}

function PhoneSheet({
  open,
  onOpenChange,
  data,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BuyerMeData;
  pending: boolean;
  onSave: (payload: { phone: string }) => void;
}) {
  const [phone, setPhone] = useState(data.phone);

  useEffect(() => {
    if (open) {
      setPhone(data.phone);
    }
  }, [open, data.phone]);

  return (
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[32dvh]">
      <SheetHeader className="border-b border-cream-200 px-5 pb-4 pt-0">
        <SheetTitle className="font-display font-semibold leading-[1.02] tracking-[-0.025em] text-cream-950" style={{ fontSize: 'var(--b-text-page)', fontFamily: 'var(--font-display)' }}>
          Phone number
        </SheetTitle>
        <p className="mt-2 leading-6 text-cream-700" style={{ fontSize: 'var(--b-text-body)' }}>
          OTP will be sent to this new number from your next login.
        </p>
      </SheetHeader>
      <SheetBody className="px-[22px] py-5">
        <SheetField label="Phone number">
          <BuyerSheetPhoneInput value={phone} onChange={setPhone} />
        </SheetField>
      </SheetBody>
      <SheetFooter className="gap-3 border-t border-cream-300 bg-cream-50 px-[22px] pb-[calc(14px+env(safe-area-inset-bottom,0px))] pt-[14px]">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1 rounded-[12px] border-cream-300 bg-white" style={{ fontSize: 'var(--b-text-body)' }}
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          className="flex-1 rounded-[12px]" style={{ fontSize: 'var(--b-text-body)' }}
          onClick={() => onSave({ phone })}
          disabled={pending}
        >
          {pending ? <Spinner size="sm" className="text-current" /> : <Check className="h-5 w-5" />}
          Save changes
        </Button>
      </SheetFooter>
    </ProfileSheetFrame>
  );
}

function CreditLimitSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invoicesQuery = useQuery({
    queryKey: ['buyer-unpaid-invoices'],
    enabled: open,
    queryFn: async () => {
      const response = await apiFetch('/api/buyer/invoices?unpaid_only=true&limit=200');
      if (!response.ok) {
        throw new Error('Failed to load unpaid invoices');
      }
      return response.json() as Promise<BuyerInvoicesResponse>;
    },
  });

  const invoices = invoicesQuery.data?.invoices ?? [];

  return (
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[42dvh]">
      <SheetHeader className="border-b-0 px-5 pb-2 pt-0">
        <SheetTitle className="font-display font-semibold leading-[1.02] tracking-[-0.025em] text-cream-950" style={{ fontSize: 'var(--b-text-page)', fontFamily: 'var(--font-display)' }}>
          Credit used
        </SheetTitle>
        <p className="mt-2 leading-6 text-cream-700" style={{ fontSize: 'var(--b-text-body)' }}>
          These unpaid invoices add up to your current credit usage.
        </p>
      </SheetHeader>
      <SheetBody className="space-y-3 px-5 py-5">
        {invoicesQuery.isLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : invoicesQuery.isError ? (
          <div className="rounded-[12px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-700">
            Couldn&apos;t load unpaid invoices right now.
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-[12px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-700">
            No unpaid invoices are contributing to your credit usage right now.
          </div>
        ) : (
          invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-[12px] border border-cream-200 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-cream-900">{invoice.invoice_number}</p>
                  <p className="mt-1 text-sm text-cream-600">
                    Invoice {formatShortDate(invoice.invoice_date)} · Due {formatShortDate(invoice.due_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-cream-900">
                    {formatNumberValue(invoice.outstanding_balance ?? 0, 'CURRENCY_EXACT')}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-cream-500">{invoice.status}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </SheetBody>
    </ProfileSheetFrame>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isLoading, isError } = useBuyerMe();
  const { effectiveBuyerRole } = useBuyerSession();
  const { signOut } = useAuth();
  const [businessSheetOpen, setBusinessSheetOpen] = useState(false);
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [creditSheetOpen, setCreditSheetOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [switchPending, setSwitchPending] = useState(false);
  const [desktopBusinessDraft, setDesktopBusinessDraft] = useState({
    business_name: '',
    contact_name: '',
    gstin: '',
    phone: '',
  });
  const [desktopBusinessEditing, setDesktopBusinessEditing] = useState(false);

  const sellerPreview = data?.seller_preview === true;
  const canEditBusiness = effectiveBuyerRole === 'buyer_admin';
  const canEditPhone = !sellerPreview;
  const canEditBuyerDetails = canEditBusiness || canEditPhone;
  const sessionPersonName = data?.session_person_name?.trim() || null;
  const headerSupportingText = [formatRoleLabel(effectiveBuyerRole), sessionPersonName, data?.phone].filter(Boolean).join(' · ');

  const initials = useMemo(() => {
    const source = data?.business_name || data?.contact_name || 'Buyer';
    return source
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [data?.contact_name, data?.business_name]);

  useEffect(() => {
    if (!data) return;
    setDesktopBusinessDraft({
      business_name: data.business_name,
      contact_name: data.contact_name,
      gstin: data.gstin ?? '',
      phone: data.phone,
    });
  }, [data]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const response = await apiPatch('/api/buyer/me', payload);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to update profile');
      }
      return body as BuyerMeData;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['buyer-me'] });
      const previous = queryClient.getQueryData<BuyerMeData>(['buyer-me']);

      if (previous) {
        queryClient.setQueryData<BuyerMeData>(['buyer-me'], {
          ...previous,
          business_name: payload.business_name ?? previous.business_name,
          contact_name: payload.contact_name ?? previous.contact_name,
          phone: payload.phone ?? previous.phone,
          gstin: payload.gstin !== undefined ? (payload.gstin || null) : previous.gstin,
        });
      }

      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['buyer-me'], context.previous);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    },
    onSuccess: (nextData) => {
      queryClient.setQueryData(['buyer-me'], nextData);
      toast.success('Profile updated');
      setBusinessSheetOpen(false);
      setPhoneSheetOpen(false);
      setDesktopBusinessEditing(false);
    },
  });

  const handleBusinessSave = (payload: { business_name: string; contact_name: string; gstin: string }) => {
    updateProfileMutation.mutate(payload);
  };

  const handlePhoneSave = (payload: { phone: string }) => {
    updateProfileMutation.mutate(payload);
  };

  const handleDesktopBusinessCancel = () => {
    if (!data) return;
    setDesktopBusinessDraft({
      business_name: data.business_name,
      contact_name: data.contact_name,
      gstin: data.gstin ?? '',
      phone: data.phone,
    });
    setDesktopBusinessEditing(false);
  };

  const handleOutstandingInvoices = () => {
    router.push('/buy/orders?tab=invoices&status=Due');
  };

  const handleHelpSupport = () => {
    if (!data?.support_whatsapp_number) {
      toast.error('Support WhatsApp number is not configured yet.');
      return;
    }

    const message = encodeURIComponent('Hi, I need help with my buyer account.');
    const destination = formatWhatsappDestination(data.support_whatsapp_number);
    window.open(`https://wa.me/${destination}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleLogout = async () => {
    try {
      setLogoutPending(true);
      await signOut();
    } catch {
      toast.error('Failed to log out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  };

  const handleSwitchAccount = () => {
    setSwitchPending(true);
    try {
      const catalogOrigin = catalogOriginForRequest(window.location.host);
      window.location.assign(`${catalogOrigin}/`);
    } finally {
      setSwitchPending(false);
    }
  };

  if (isError) {
    return (
      <div className="p-4">
        <div className="rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-5 text-sm text-cream-700">
          Couldn&apos;t load your profile right now.
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return null;
  }

  return (
    <div className="min-h-full bg-[var(--bg-base)] pb-8">
      <div className="md:hidden">
        <div className="px-4 pb-8 pt-8" style={{ background: 'linear-gradient(135deg, #346A5C 0%, #1F3A34 60%, #142823 100%)' }}>
          <div className="flex items-center gap-4">
            <div
              className="flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white"
              style={{ width: 64, height: 64, background: 'var(--ember-400)', border: '2px solid var(--ember-200)', fontSize: 'var(--b-text-kpi)', fontFamily: 'var(--font-display)', fontWeight: 500 }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="leading-none text-white" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-kpi)', fontWeight: 500, letterSpacing: '-0.015em' }}>
                {data.business_name}
              </h1>
              <p className="mt-2 font-normal text-white/70" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-label)' }}>
                {[sessionPersonName, data.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </div>

        {sellerPreview ? (
          <div className="px-4 pt-3">
            <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Previewing as seller. Buyers see their account details and credit summary here.
            </div>
          </div>
        ) : null}

        <div className="px-4 pt-5">
          <p className="px-2 font-semibold uppercase text-cream-600" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}>Account</p>
          <div className="mt-3 overflow-hidden rounded-[12px] border border-cream-200 bg-white">
            <div className="border-b border-cream-200">
              <AccountRow
                icon={<BriefcaseBusiness className="h-5 w-5" />}
                title="Business details"
                subtitle={data.business_name}
                onClick={canEditBusiness ? () => setBusinessSheetOpen(true) : undefined}
                action={canEditBusiness ? <ChevronRight className="h-5 w-5 text-cream-500" /> : null}
              />
            </div>
            <div className="border-b border-cream-200">
              <AccountRow
                icon={<Phone className="h-5 w-5" />}
                title="Phone number"
                subtitle={data.phone}
                onClick={() => setPhoneSheetOpen(true)}
                action={<ChevronRight className="h-5 w-5 text-cream-500" />}
                mono
              />
            </div>
            {data.business_policy.credit_enabled ? (
              <AccountRow
                icon={<Wallet className="h-5 w-5" />}
                tone="accent"
                title="Credit limit"
                subtitle={`${formatNumberValue(data.credit_used, 'CURRENCY_EXACT')} used of ${formatNumberValue(data.credit_limit, 'CURRENCY_EXACT')}`}
                onClick={() => setCreditSheetOpen(true)}
                action={<ChevronRight className="h-5 w-5 text-cream-500" />}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-3 px-4 pt-5">
          <div className="overflow-hidden rounded-[12px] border border-cream-200 bg-white">
            <AccountRow
              icon={<HelpCircle className="h-5 w-5" />}
              title="Help & Support"
              subtitle="Chat with us on WhatsApp"
              onClick={handleHelpSupport}
              action={<ChevronRight className="h-5 w-5 text-cream-500" />}
            />
          </div>

          <div className="overflow-hidden rounded-[12px] border border-cream-200 bg-white">
            <AccountRow
              icon={<Repeat className="h-5 w-5" />}
              title="Other suppliers you buy from"
              subtitle="Switch to another approved catalog with this number"
              onClick={() => { void handleSwitchAccount(); }}
              action={switchPending ? <Spinner size="sm" /> : <ChevronRight className="h-5 w-5 text-cream-500" />}
            />
          </div>

          <div className="overflow-hidden rounded-[12px] border border-cream-200 bg-white">
            <AccountRow
              icon={<LogOut className="h-5 w-5" />}
              tone="danger"
              title="Logout"
              subtitle="You’ll need a fresh OTP next time."
              onClick={() => { void handleLogout(); }}
              action={logoutPending ? <Spinner size="sm" /> : null}
            />
          </div>
        </div>
      </div>

      <div className="hidden px-6 py-6 md:block xl:px-8">
        <section className="space-y-5">
          <div className="rounded-[14px] border border-cream-300 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white"
                  style={{ background: 'var(--ember-400)', border: '2px solid var(--ember-200)', fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-500">Customer</p>
                  <h1
                    className="mt-2 text-cream-950"
                    style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page-sm)', fontWeight: 600, letterSpacing: '-0.022em' }}
                  >
                    {data.business_name}
                  </h1>
                  <p className="mt-2 text-sm text-cream-600">{headerSupportingText}</p>
                </div>
              </div>

              {data.business_policy.credit_enabled && data.credit_used > 0 ? (
                <div className="min-w-[240px] rounded-[14px] border border-amber-200 bg-amber-50 px-[18px] py-[16px]">
                  <p className="font-semibold uppercase tracking-[0.14em] text-amber-800" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                    Credit attention
                  </p>
                  <p
                    className="mt-2 leading-none text-amber-950"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--b-text-header)',
                      fontWeight: 600,
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {formatNumberValue(data.credit_used, 'CURRENCY_EXACT')} outstanding
                  </p>
                  <p className="mt-2 text-sm font-medium text-amber-900">
                    Limit {formatNumberValue(data.credit_limit, 'CURRENCY_EXACT')}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <article className="rounded-[14px] border border-cream-300 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-md text-cream-950">Buyer details</h3>
                {canEditBuyerDetails ? (
                  <div className="flex items-center gap-2">
                    {desktopBusinessEditing ? (
                      <>
                        <Button variant="secondary" size="sm" onClick={handleDesktopBusinessCancel} disabled={updateProfileMutation.isPending}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateProfileMutation.mutate({
                            ...(canEditBusiness ? {
                              business_name: desktopBusinessDraft.business_name,
                              contact_name: desktopBusinessDraft.contact_name,
                              gstin: desktopBusinessDraft.gstin,
                            } : {}),
                            ...(canEditPhone ? { phone: desktopBusinessDraft.phone } : {}),
                          })}
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? <Spinner size="sm" className="text-current" /> : <Check className="h-4 w-4" />}
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setDesktopBusinessEditing(true)}>
                        Edit
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>

              {desktopBusinessEditing ? (
                <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
                  {canEditBusiness ? (
                    <>
                      <InlineField
                        label="Business name"
                        value={desktopBusinessDraft.business_name}
                        onChange={(value) => setDesktopBusinessDraft((current) => ({ ...current, business_name: value }))}
                        maxLength={200}
                      />
                      <InlineField
                        label="Contact name"
                        value={desktopBusinessDraft.contact_name}
                        onChange={(value) => setDesktopBusinessDraft((current) => ({ ...current, contact_name: value }))}
                        maxLength={200}
                      />
                      <InlineField
                        label="GSTIN"
                        value={desktopBusinessDraft.gstin}
                        onChange={(value) => setDesktopBusinessDraft((current) => ({ ...current, gstin: value }))}
                        maxLength={15}
                        mono
                        uppercase
                        hint="Leave blank if your business is not GST registered."
                      />
                    </>
                  ) : (
                    <>
                      <DetailRow label="Business name" value={data.business_name} />
                      <DetailRow label="Contact name" value={data.contact_name || '—'} />
                      <DetailRow label="GSTIN" value={data.gstin || '—'} mono />
                    </>
                  )}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Phone</span>
                    <BuyerSheetPhoneInput
                      value={desktopBusinessDraft.phone}
                      onChange={(value) => setDesktopBusinessDraft((current) => ({ ...current, phone: value }))}
                    />
                    <span className="block text-sm text-cream-600">OTP will be sent here from your next login.</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
                  <DetailRow label="Business name" value={data.business_name} />
                  <DetailRow label="Contact name" value={data.contact_name || '—'} />
                  <DetailRow label="GSTIN" value={data.gstin || '—'} mono />
                  <DetailRow label="Phone" value={data.phone} mono />
                </div>
              )}
            </article>

            <article className="rounded-[14px] border border-cream-300 bg-white p-5">
              <h3 className="font-display text-md text-cream-950">Credit details</h3>
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
                {data.business_policy.credit_enabled ? (
                  <>
                    <DetailRow
                      label="Credit limit"
                      value={formatNumberValue(data.credit_limit, 'CURRENCY_EXACT')}
                      mono
                    />
                    <DetailRow
                      label="Credit used"
                      value={formatNumberValue(data.credit_used, 'CURRENCY_EXACT')}
                      mono
                    />
                    <DetailRow
                      label="Available credit"
                      value={formatNumberValue(Math.max(data.credit_limit - data.credit_used, 0), 'CURRENCY_EXACT')}
                      mono
                    />
                  </>
                ) : (
                  <DetailRow label="Credit" value="Not enabled" />
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Outstanding invoices</p>
                  <p className="mt-1 text-sm text-cream-600">Review unpaid invoices in the Orders section.</p>
                </div>
                <Button variant="secondary" onClick={handleOutstandingInvoices}>
                  View outstanding invoices
                </Button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <BusinessDetailsSheet
        open={businessSheetOpen}
        onOpenChange={setBusinessSheetOpen}
        data={data}
        pending={updateProfileMutation.isPending}
        onSave={handleBusinessSave}
      />
      <PhoneSheet
        open={phoneSheetOpen}
        onOpenChange={setPhoneSheetOpen}
        data={data}
        pending={updateProfileMutation.isPending}
        onSave={handlePhoneSave}
      />
      <CreditLimitSheet open={creditSheetOpen} onOpenChange={setCreditSheetOpen} />
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Check, ChevronRight, HelpCircle, LogOut, Phone, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

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
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${toneClasses}`}>
      {icon}
    </div>
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
        <div className="text-[1.05rem] font-semibold leading-tight text-cream-900">{title}</div>
        <div className={`mt-1 text-sm leading-5 text-cream-600 ${mono ? 'font-mono' : ''}`}>{subtitle}</div>
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
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{label}</p>
      {children}
      {hint ? <p className="text-sm text-cream-600">{hint}</p> : null}
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
        className={`flex max-h-[calc(100vh-20px)] flex-col overflow-hidden rounded-t-[32px] border-0 bg-[#fcf8f2] p-0 shadow-[0_-24px_60px_rgba(23,36,31,0.18)] ${className ?? ''}`}
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
    <div className="flex h-14 items-stretch overflow-hidden rounded-[18px] border border-cream-300 bg-white transition-colors duration-fast ease-standard focus-within:border-ember-400 focus-within:ring-2 focus-within:ring-ember-400/20">
      <span className="inline-flex items-center border-r border-cream-300 bg-[#f6efe4] px-4 text-lg font-medium text-cream-700">
        +91
      </span>
      <input
        inputMode="numeric"
        type="tel"
        value={value}
        onChange={(e) => onChange(normalizePhoneInput(e.target.value))}
        maxLength={10}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent px-4 font-sans text-lg text-cream-900 placeholder:text-cream-500 focus:outline-none focus:ring-0"
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
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[44vh]">
      <SheetHeader className="border-b-0 px-5 pb-2 pt-0">
        <SheetTitle className="font-display text-[2rem] font-semibold leading-[1.02] tracking-[-0.03em] text-cream-950">
          Edit business details
        </SheetTitle>
        <p className="mt-3 max-w-[32rem] text-[15px] leading-7 text-cream-700">
          These details appear on every order placed and on invoices issued by your distributors.
        </p>
      </SheetHeader>
      <SheetBody className="space-y-5 px-5 py-5">
        <SheetField label="Business name">
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={200}
            className="h-14 rounded-[18px] border-cream-300 bg-white px-4 text-lg"
          />
        </SheetField>
        <SheetField label="Contact name">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={200}
            className="h-14 rounded-[18px] border-cream-300 bg-white px-4 text-lg"
          />
        </SheetField>
        <SheetField label="GSTIN" hint="Leave blank if your business is not GST registered.">
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
            className="h-14 rounded-[18px] border-cream-300 bg-white px-4 text-lg"
          />
        </SheetField>
      </SheetBody>
      <SheetFooter className="gap-3 border-t-0 bg-transparent px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-2">
        <Button
          variant="secondary"
          size="lg"
          className="h-14 flex-1 rounded-[18px] border-cream-300 bg-white text-lg"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          className="h-14 flex-1 rounded-[18px] text-lg"
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
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[32vh]">
      <SheetHeader className="border-b-0 px-5 pb-2 pt-0">
        <SheetTitle className="font-display text-[2rem] font-semibold leading-[1.02] tracking-[-0.03em] text-cream-950">
          Phone number
        </SheetTitle>
        <p className="mt-2 text-[15px] leading-7 text-cream-700">
          OTP will be sent to this new number from your next login.
        </p>
      </SheetHeader>
      <SheetBody className="px-5 py-5">
        <SheetField label="Phone number">
          <BuyerSheetPhoneInput value={phone} onChange={setPhone} />
        </SheetField>
      </SheetBody>
      <SheetFooter className="gap-3 border-t-0 bg-transparent px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-2">
        <Button
          variant="secondary"
          size="lg"
          className="h-14 flex-1 rounded-[18px] border-cream-300 bg-white text-lg"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          className="h-14 flex-1 rounded-[18px] text-lg"
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
    <ProfileSheetFrame open={open} onOpenChange={onOpenChange} className="min-h-[42vh]">
      <SheetHeader className="border-b-0 px-5 pb-2 pt-0">
        <SheetTitle className="font-display text-[2rem] font-semibold leading-[1.02] tracking-[-0.03em] text-cream-950">
          Credit used
        </SheetTitle>
        <p className="mt-2 text-[15px] leading-7 text-cream-700">
          These unpaid invoices add up to your current credit usage.
        </p>
      </SheetHeader>
      <SheetBody className="space-y-3 px-5 py-5">
        {invoicesQuery.isLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : invoicesQuery.isError ? (
          <div className="rounded-[22px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-700">
            Couldn&apos;t load unpaid invoices right now.
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-[22px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-700">
            No unpaid invoices are contributing to your credit usage right now.
          </div>
        ) : (
          invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-[22px] border border-cream-200 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-cream-900">{invoice.invoice_number}</p>
                  <p className="mt-1 text-sm text-cream-600">
                    Invoice {formatShortDate(invoice.invoice_date)} · Due {formatShortDate(invoice.due_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-cream-900">
                    {formatCurrency(invoice.outstanding_balance ?? 0)}
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useBuyerMe();
  const { effectiveBuyerRole } = useBuyerSession();
  const { signOut } = useAuth();
  const [businessSheetOpen, setBusinessSheetOpen] = useState(false);
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [creditSheetOpen, setCreditSheetOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const canEditBusiness = effectiveBuyerRole === 'buyer_admin';
  const sellerPreview = data?.seller_preview === true;

  const initials = useMemo(() => {
    const source = data?.contact_name || data?.business_name || 'Buyer';
    return source
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [data?.contact_name, data?.business_name]);

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
    },
  });

  const handleBusinessSave = (payload: { business_name: string; contact_name: string; gstin: string }) => {
    updateProfileMutation.mutate(payload);
  };

  const handlePhoneSave = (payload: { phone: string }) => {
    updateProfileMutation.mutate(payload);
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
      router.replace('/login');
    } catch {
      toast.error('Failed to log out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  };

  if (isError) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-5 text-sm text-cream-700">
          Couldn&apos;t load your profile right now.
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8f4ed] pb-8">
      <div className="bg-[linear-gradient(135deg,#21433B_0%,#17372F_100%)] px-4 pb-8 pt-8">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] border-[#efc58d] bg-[#c97539] text-[2rem] font-semibold tracking-tight text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] font-semibold leading-none tracking-[-0.02em] text-white">
              {data.greeting_name || data.contact_name || data.business_name}
            </h1>
            <p className="mt-3 text-base font-normal text-white/80">{data.business_name}</p>
          </div>
        </div>
      </div>

      {sellerPreview ? (
        <div className="px-4 pt-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Previewing as seller. Buyers see their account details and credit summary here.
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-5">
        <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-cream-600">Account</p>
        <div className="mt-3 overflow-hidden rounded-[24px] border border-cream-200 bg-white">
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
              subtitle={`${formatCurrency(data.credit_used)} used of ${formatCurrency(data.credit_limit)}`}
              onClick={() => setCreditSheetOpen(true)}
              action={<ChevronRight className="h-5 w-5 text-cream-500" />}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-4 pt-5">
        <div className="overflow-hidden rounded-[24px] border border-cream-200 bg-white">
          <AccountRow
            icon={<HelpCircle className="h-5 w-5" />}
            title="Help & Support"
            subtitle="Chat with us on WhatsApp"
            onClick={handleHelpSupport}
            action={<ChevronRight className="h-5 w-5 text-cream-500" />}
          />
        </div>

        <div className="overflow-hidden rounded-[24px] border border-cream-200 bg-white">
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

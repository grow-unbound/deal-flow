'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { UserPlus, Save, Lock } from 'lucide-react';
import { BuyerCreateSchema, type BuyerCreateInput } from '@/lib/zod';
import { INDIAN_STATES } from '@/constants';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

interface BuyerFormProps {
  mode: 'create' | 'edit';
  /** Buyer ID — required in edit mode for URL construction */
  buyerId?: string;
  defaultValues?: Partial<BuyerCreateInput>;
  onSubmit: (data: BuyerCreateInput) => Promise<void>;
  isSubmitting: boolean;
  submitError?: string;
  onCancel?: () => void;
}

const TIER_OPTIONS = [
  {
    value: 'A' as const,
    label: 'Tier A',
    description: 'Premium buyers',
    card: 'bg-teal-50 border-teal-300',
    selected: 'ring-2 ring-teal-400',
  },
  {
    value: 'B' as const,
    label: 'Tier B',
    description: 'Standard buyers',
    card: 'bg-cream-100 border-cream-300',
    selected: 'ring-2 ring-cream-400',
  },
  {
    value: 'C' as const,
    label: 'Tier C',
    description: 'Basic buyers',
    card: 'bg-cream-50 border-cream-200',
    selected: 'ring-2 ring-cream-300',
  },
] as const;

export function BuyerForm({
  mode,
  buyerId: _buyerId,
  defaultValues,
  onSubmit,
  isSubmitting,
  submitError,
  onCancel,
}: BuyerFormProps) {
  const router = useRouter();
  const { isSellerAdmin } = useRole();

  // Capture initial values for change detection in edit mode
  const initialValuesRef = useRef(defaultValues);

  const form = useForm<BuyerCreateInput>({
    resolver: zodResolver(BuyerCreateSchema),
    defaultValues: {
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      external_ref: '',
      credit_limit: 0,
      payment_terms_days: 0,
      geography: {
        city: '',
        state: '',
        pincode: '',
        zone: '',
      },
      ...defaultValues,
    },
  });

  /* eslint-disable react-hooks/incompatible-library */
  const selectedTier = form.watch('tier');
  const watchedGeography = form.watch('geography');
  /* eslint-enable react-hooks/incompatible-library */

  // In edit mode, detect if tier or geography changed from initial values
  const showCohortNotice = (() => {
    if (mode !== 'edit') return false;
    const init = initialValuesRef.current;
    const tierChanged = selectedTier !== init?.tier;
    const geoChanged =
      watchedGeography?.city !== (init?.geography?.city ?? '') ||
      watchedGeography?.state !== (init?.geography?.state ?? '') ||
      watchedGeography?.pincode !== (init?.geography?.pincode ?? '') ||
      watchedGeography?.zone !== (init?.geography?.zone ?? '');
    return tierChanged || geoChanged;
  })();

  // Determine if external_ref is locked (non-null, non-empty initial value in edit mode)
  const isExternalRefLocked =
    mode === 'edit' &&
    defaultValues?.external_ref != null &&
    defaultValues.external_ref.trim() !== '';

  // Keep initialValuesRef stable (set once on mount)
  useEffect(() => {
    initialValuesRef.current = defaultValues;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {submitError && (
          <p className="text-caption text-danger-500 bg-danger-50 rounded-md px-3 py-2">
            {submitError}
          </p>
        )}

        {/* Cohort membership notice — shown when tier or geography changes in edit mode */}
        {showCohortNotice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm">
            Changing tier or geography may update this buyer&apos;s cohort memberships.
          </div>
        )}

        {/* Business Details */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Business Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="business_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    Business name <span className="text-danger-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Retailer Business Name"
                      className="bg-cream-50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    Contact name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Owner / Contact person"
                      className="bg-cream-50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Contact */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Contact</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    Phone <span className="text-danger-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="9876543210"
                      className="bg-cream-50 font-mono"
                      maxLength={10}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="buyer@example.com"
                      className="bg-cream-50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Business IDs */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Business IDs</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="gstin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    GSTIN
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="22AAAAA0000A1Z5"
                      className="bg-cream-50 font-mono uppercase"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="external_ref"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800 flex items-center gap-1">
                    ERP Reference
                    {isExternalRefLocked && (
                      <span title="ERP ID cannot be changed once set">
                        <Lock size={12} className="text-cream-500 ml-1" />
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tally / Zoho ledger code"
                      className={
                        isExternalRefLocked
                          ? 'bg-cream-200 text-cream-500 cursor-not-allowed font-mono'
                          : 'bg-cream-50 font-mono'
                      }
                      readOnly={isExternalRefLocked}
                      disabled={isExternalRefLocked}
                      {...field}
                    />
                  </FormControl>
                  {isExternalRefLocked && (
                    <p className="text-caption text-cream-500 mt-1">
                      ERP ID cannot be changed once set
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Location */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Location</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="geography.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">City</FormLabel>
                  <FormControl>
                    <Input placeholder="Mumbai" className="bg-cream-50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="geography.state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">State</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-cream-50">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INDIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="geography.pincode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">Pincode</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="400001"
                      className="bg-cream-50 font-mono"
                      maxLength={6}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="geography.zone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">Zone</FormLabel>
                  <FormControl>
                    <Input placeholder="West / North / South" className="bg-cream-50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Tier */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Buyer Tier</h3>
          <FormField
            control={form.control}
            name="tier"
            render={({ field }) => (
              <FormItem>
                <div className="flex gap-3" role="radiogroup" aria-label="Buyer tier">
                  {TIER_OPTIONS.map((opt) => {
                    const isSelected = selectedTier === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={[
                          'flex-1 flex flex-col items-center gap-1 p-4 rounded-lg border-2 cursor-pointer transition-all duration-fast',
                          opt.card,
                          isSelected ? opt.selected : 'hover:opacity-80',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          value={opt.value}
                          checked={isSelected}
                          onChange={() => field.onChange(opt.value)}
                        />
                        <span className="text-h3 font-display font-bold text-cream-900">
                          {opt.value}
                        </span>
                        <span className="text-caption font-medium text-cream-700">
                          {opt.label}
                        </span>
                        <span className="text-caption text-cream-500 text-center">
                          {opt.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Financial — seller_admin only */}
        {isSellerAdmin && (
          <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
            <h3 className="text-body font-semibold text-cream-900">Financial</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="credit_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-caption font-medium text-cream-800">
                      Credit limit (₹)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        placeholder="0"
                        className="bg-cream-50 font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payment_terms_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-caption font-medium text-cream-800">
                      Payment terms (days)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        className="bg-cream-50 font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2"
          >
            {mode === 'create' ? <UserPlus size={16} /> : <Save size={16} />}
            {isSubmitting
              ? mode === 'create' ? 'Adding…' : 'Saving…'
              : mode === 'create' ? 'Add Customer' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

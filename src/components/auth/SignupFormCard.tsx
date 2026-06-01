'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { INDIAN_STATES } from '@/constants';

const SignupFormSchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    phone: z
      .string()
      .regex(/^[0-9]{10}$/, 'Phone must be 10 digits')
      .optional()
      .or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
    business_name: z.string().min(1, 'Business name is required'),
    slug: z
      .string()
      .min(3, 'Business URL must be at least 3 characters')
      .max(50, 'Business URL must be 50 characters or less')
      .regex(/^[a-z0-9-]+$/, 'Business URL may only contain lowercase letters, numbers, and hyphens'),
    primary_state: z.string().optional(),
    gstin: z.string().optional(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type SignupFormValues = z.infer<typeof SignupFormSchema>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function SignupFormCard() {
  const router = useRouter();
  const posthog = usePostHog();
  const [apiError, setApiError] = useState('');

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(SignupFormSchema),
    defaultValues: {
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      business_name: '',
      slug: '',
      primary_state: 'Karnataka',
      gstin: '',
    },
    mode: 'onBlur',
  });

  const { isSubmitting } = form.formState;

  function handleBusinessNameChange(value: string) {
    form.setValue('business_name', value);
    if (!form.getFieldState('slug').isDirty) {
      form.setValue('slug', slugify(value), { shouldDirty: false });
    }
  }

  async function onSubmit(values: SignupFormValues) {
    setApiError('');
    try {
      const distinctId = posthog?.get_distinct_id();
      const sessionId = posthog?.get_session_id?.();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(distinctId && { 'X-POSTHOG-DISTINCT-ID': distinctId }),
          ...(sessionId && { 'X-POSTHOG-SESSION-ID': sessionId }),
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          business_name: values.business_name,
          slug: values.slug,
          phone: values.phone || undefined,
          gstin: values.gstin || undefined,
          primary_state: values.primary_state || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 || data.code === 'SLUG_TAKEN') {
          form.setError('slug', {
            message: 'This business URL is already in use. Try a different one.',
          });
        } else {
          setApiError(data.error ?? 'Signup failed. Please try again.');
          posthog?.capture('signup_failed', { reason: data.error });
        }
        return;
      }

      posthog?.identify(data.user.id, { email: data.user.email });
      posthog?.capture('user_signed_up', {
        tenant_slug: data.tenant?.slug,
        business_name: data.tenant?.business_name,
        primary_state: values.primary_state,
        plan: 'starter',
      });

      router.push('/dashboard?first_run=1');
    } catch (err) {
      posthog?.captureException(err);
      setApiError('An unexpected error occurred. Please try again.');
    }
  }

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-lg shadow-md p-8">
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
          <span className="text-cream-50 font-display font-medium text-sm">DF</span>
        </div>
        <span className="font-display font-medium text-teal-500 text-xl">DealFlow</span>
      </div>

      <h1 className="font-display text-h2 text-cream-900 mb-1">Create your workspace</h1>
      <p className="font-sans text-body-sm text-cream-600 mb-6">Set up your distributor account in under a minute.</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1" noValidate>
          <p className="text-caption font-semibold text-cream-500 uppercase tracking-widest" style={{ fontSize: '10px' }}>Account</p>

          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="font-sans text-cream-700">Email</FormLabel>
              <FormControl><Input type="email" placeholder="you@company.com" autoComplete="email" className="border-cream-300 focus-visible:ring-ember-400" {...field} /></FormControl>
              <FormMessage className="text-danger-500" />
            </FormItem>
          )} />

          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel className="font-sans text-cream-700">Phone <span className="text-cream-400 font-normal normal-case">(optional)</span></FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 rounded-md bg-cream-100 border border-cream-300 text-cream-600 text-body-sm select-none">+91</span>
                  <Input type="tel" placeholder="9876543210" maxLength={10} autoComplete="tel" className="border-cream-300 focus-visible:ring-ember-400" {...field} />
                </div>
              </FormControl>
              <FormMessage className="text-danger-500" />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans text-cream-700">Password</FormLabel>
                <FormControl><Input type="password" placeholder="Min 8 characters" autoComplete="new-password" className="border-cream-300 focus-visible:ring-ember-400" {...field} /></FormControl>
                <FormMessage className="text-danger-500" />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirm_password" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans text-cream-700">Confirm</FormLabel>
                <FormControl><Input type="password" placeholder="••••••••" autoComplete="new-password" className="border-cream-300 focus-visible:ring-ember-400" {...field} /></FormControl>
                <FormMessage className="text-danger-500" />
              </FormItem>
            )} />
          </div>

          <p className="text-caption font-semibold text-cream-500 uppercase tracking-widest pt-2" style={{ fontSize: '10px' }}>Business</p>

          <FormField control={form.control} name="business_name" render={({ field }) => (
            <FormItem>
              <FormLabel className="font-sans text-cream-700">Business name</FormLabel>
              <FormControl>
                <Input placeholder="Your Business Ltd." className="border-cream-300 focus-visible:ring-ember-400" {...field} onChange={(e) => handleBusinessNameChange(e.target.value)} />
              </FormControl>
              <FormMessage className="text-danger-500" />
            </FormItem>
          )} />

          <FormField control={form.control} name="slug" render={({ field }) => (
            <FormItem>
              <FormLabel className="font-sans text-cream-700">Business URL</FormLabel>
              <FormControl>
                <div className="flex rounded-md overflow-hidden border border-cream-300 focus-within:border-ember-400 focus-within:ring-2 focus-within:ring-ember-400/20 transition-colors bg-cream-50">
                  <Input
                    placeholder="your-business"
                    className="flex-1 border-0 shadow-none focus-visible:ring-0 rounded-none bg-transparent"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
                  />
                  <span className="flex items-center px-3 text-cream-500 text-body-sm bg-cream-100 border-l border-cream-300 select-none whitespace-nowrap">.dealflow.in</span>
                </div>
              </FormControl>
              <FormMessage className="text-danger-500" />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="primary_state" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans text-cream-700">State</FormLabel>
                <FormControl>
                  <select {...field} className="w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors">
                    {INDIAN_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </FormControl>
                <FormMessage className="text-danger-500" />
              </FormItem>
            )} />
            <FormField control={form.control} name="gstin" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans text-cream-700">GSTIN <span className="text-cream-400 font-normal normal-case">(optional)</span></FormLabel>
                <FormControl><Input placeholder="18AABCT1234H1Z0" className="border-cream-300 focus-visible:ring-ember-400" {...field} /></FormControl>
                <FormMessage className="text-danger-500" />
              </FormItem>
            )} />
          </div>

          {apiError && <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{apiError}</p>}

          <Button type="submit" disabled={isSubmitting} className="w-full bg-teal-500 hover:bg-teal-600 text-cream-50">
            <Plus className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Creating workspace…' : 'Create my workspace'}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center font-sans text-body-sm text-cream-600">
        Already have an account? <Link href="/login" className="text-teal-600 hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  );
}

'use client';

import { FilePlus2, User } from 'lucide-react';
import { TenantLogo } from '@/components/brand/TenantLogo';
import type { ExistingProfileRow } from '@/types/buyer-onboarding';

/**
 * Shared multi-profile picker for /onboarding, per
 * specs/Yukti_Public-Signup_Frontend-Spec_v1.md §1.1 row 6 + §0b addendum:
 * one component covering both "business profiles found" and "personal
 * profiles found" (and mixed), copy varies, visuals reuse the card pattern
 * from app/(auth)/login/select-context/page.tsx rather than a new list UI.
 */

export interface ProfilePickerProps {
  profiles: ExistingProfileRow[];
  onSelect: (profile: ExistingProfileRow) => void;
  onStartFresh: () => void;
  disabled?: boolean;
}

function headline(profiles: ExistingProfileRow[]): string {
  const n = profiles.length;
  const allBusiness = profiles.every((p) => p.is_business);
  const allPersonal = profiles.every((p) => !p.is_business);
  if (allBusiness) {
    return `We found ${n} business profile${n === 1 ? '' : 's'} for this number — pick one to continue`;
  }
  if (allPersonal) {
    return `We found ${n} profile${n === 1 ? '' : 's'} for this number — pick one to continue`;
  }
  return `We found ${n} profile${n === 1 ? '' : 's'} for this number — pick one to continue`;
}

export function ProfilePicker({ profiles, onSelect, onStartFresh, disabled }: ProfilePickerProps) {
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => !disabled && onStartFresh()}
        disabled={disabled}
        className={[
          'mb-5 flex w-full items-center gap-3 rounded-lg border border-teal-300 bg-teal-50 px-4 py-3.5 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-teal-500 hover:bg-teal-100/70',
        ].join(' ')}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-teal-700 shadow-sm">
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-body-sm font-semibold text-teal-900">Fill a new request form</span>
          <span className="mt-0.5 block text-caption text-teal-800">Start a fresh access request</span>
        </span>
      </button>

      <h2 className="text-body font-semibold text-cream-900 mb-1">{headline(profiles)}</h2>
      <p className="text-caption text-cream-600 mb-4">
        Or choose one of these profiles to reuse known details.
      </p>

      <div className="space-y-2">
        {profiles.map((profile) => {
          const accountName = profile.is_business
            ? profile.business_name?.trim() || 'Business profile'
            : profile.contact_name?.trim() || 'Personal profile';
          const subtitle = [accountName, profile.gstin].filter(Boolean).join(' · ');

          return (
            <button
              key={`${profile.tenant_id}:${profile.buyer_id}`}
              type="button"
              onClick={() => !disabled && onSelect(profile)}
              disabled={disabled}
              className={[
                'w-full text-left px-4 py-3.5 rounded-lg border transition-all duration-base',
                'bg-[var(--bg-surface)] hover:bg-cream-50 border-cream-300 hover:border-cream-400',
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] border border-cream-200 bg-white p-0.5 shadow-sm">
                  {profile.tenant_logo_url ? (
                    <TenantLogo
                      name={profile.tenant_name}
                      logoUrl={profile.tenant_logo_url}
                      size={32}
                      shape="square"
                    />
                  ) : (
                    <User className="h-4 w-4 text-cream-700" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-cream-900 truncate">{profile.tenant_name}</p>
                  {subtitle && <p className="text-caption text-cream-600 mt-0.5 truncate">{subtitle}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-caption text-cream-500">You can return to this list before sending a request.</p>
    </div>
  );
}

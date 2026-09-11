'use client';

import { Store, User } from 'lucide-react';
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
      <h2 className="text-body font-semibold text-cream-900 mb-1">{headline(profiles)}</h2>
      <p className="text-caption text-cream-600 mb-4">
        These are other profiles already linked to your phone number.
      </p>

      <div className="space-y-2">
        {profiles.map((profile) => {
          const Icon = profile.is_business ? Store : User;
          const title = profile.is_business
            ? profile.business_name?.trim() || 'Business profile'
            : profile.contact_name?.trim() || 'Personal profile';
          const subtitle = profile.is_business
            ? [profile.gstin, profile.tenant_name].filter(Boolean).join(' · ')
            : profile.tenant_name;

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
                <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-cream-100 text-cream-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-cream-900 truncate">{title}</p>
                  {subtitle && <p className="text-caption text-cream-600 mt-0.5 truncate">{subtitle}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => !disabled && onStartFresh()}
        disabled={disabled}
        className="mt-3 w-full text-caption text-cream-600 hover:text-cream-800 transition-colors text-center"
      >
        None of these, start fresh
      </button>
    </div>
  );
}

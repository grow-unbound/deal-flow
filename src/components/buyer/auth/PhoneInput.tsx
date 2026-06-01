'use client';

import { useState, FormEvent } from 'react';

interface PhoneInputProps {
  onSubmit: (phoneNumber: string) => void | Promise<void>;
  loading?: boolean;
  error?: string;
}

const inputCls =
  'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 transition-colors disabled:opacity-50';

const labelCls =
  'block text-cream-700 font-semibold mb-1.5 text-[11px] uppercase tracking-[0.08em]';

export function PhoneInput({ onSubmit, loading = false, error }: PhoneInputProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = value.trim().replace(/\s+/g, '');
    if (cleaned) onSubmit(cleaned);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="phone" className={labelCls}>
          Mobile number
        </label>
        <div className="flex items-stretch">
          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-cream-300 bg-cream-100 text-cream-600 text-body-sm select-none">
            +91
          </span>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            maxLength={10}
            placeholder="9876543210"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            disabled={loading}
            required
            autoComplete="tel-national"
            className={`${inputCls} rounded-l-none`}
          />
        </div>
      </div>

      {error && (
        <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || value.length !== 10}
        className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending OTP…' : 'Send OTP'}
      </button>
    </form>
  );
}

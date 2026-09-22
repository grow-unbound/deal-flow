'use client';

import { AlertTriangle } from 'lucide-react';

export interface FulfilmentAlertLine {
  name: string;
  onHand: number;
  qty: number;
}

export interface FulfilmentAlertProps {
  lines: FulfilmentAlertLine[];
  onResolve?: () => void;
}

export function FulfilmentAlert({ lines, onResolve }: FulfilmentAlertProps) {
  if (lines.length === 0) {
    return null;
  }

  const first = lines[0];
  const short = first.qty - first.onHand;
  const title =
    lines.length === 1 ? "One line can't be fully fulfilled" : `${lines.length} lines can't be fully fulfilled`;

  return (
    <div className="mt-3 flex items-start gap-3 rounded-[10px] border border-warning-50 bg-warning-50 p-4">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-warning-700">{title}</div>
        <div className="mt-0.5 text-sm leading-[1.45] text-cream-800">
          <span className="font-semibold text-cream-900">{first.name}</span>
          {' — '}
          {first.onHand} of {first.qty} in stock, <span className="font-semibold text-cream-900">{short} short</span>.
          Confirm a partial, backorder the rest, or substitute.
        </div>
      </div>
      <button
        type="button"
        className="cockpit-btn cockpit-btn-ghost cockpit-btn-sm shrink-0 self-center text-warning-700 hover:bg-warning-50"
        onClick={() => onResolve?.()}
      >
        Resolve stock
      </button>
    </div>
  );
}

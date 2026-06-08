import type { LucideIcon } from 'lucide-react';
import {
  Copy,
  FileText,
  ListChecks,
  Mail,
  Pencil,
  Send,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';

import type { TransactionalStatusBandStep } from '@/components/seller/transactional';
import type { EstimateDbStatus } from '@/types/tenant-estimates';

export type EstimateDetailActionKind =
  | 'send'
  | 'accept'
  | 'decline'
  | 'convert_order'
  | 'convert_invoice'
  | 'duplicate'
  | 'view_sales_order'
  | 'view_invoice'
  | 'edit_items'
  | 'send_reminder'
  | 'noop';

export interface EstimateDetailCta {
  kind: EstimateDetailActionKind;
  label: string;
  icon: LucideIcon;
}

export interface EstimateDetailStateConfig {
  steps: TransactionalStatusBandStep[];
  whatsNext: string;
  primary: EstimateDetailCta;
  secondaries: EstimateDetailCta[];
  danger: EstimateDetailCta | null;
}

function fmtShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildEstimateStateConfig(
  status: Exclude<EstimateDbStatus, 'pending'>,
  ctx: {
    orderNumber: string | null;
    invoiceNumber: string | null;
    createdAt: string;
    sentAt: string | null;
    acceptedAt: string | null;
  },
): EstimateDetailStateConfig {
  const { createdAt, sentAt, acceptedAt, orderNumber, invoiceNumber } = ctx;

  const baseSteps = (a: TransactionalStatusBandStep, b: TransactionalStatusBandStep, c: TransactionalStatusBandStep) =>
    [a, b, c];

  switch (status) {
    case 'draft':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'current', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'future' },
          { label: 'Accepted', state: 'future' },
        ),
        whatsNext: 'Fill in the items and send to the buyer to get their decision.',
        primary: { kind: 'send', label: 'Send to buyer', icon: Send },
        secondaries: [{ kind: 'edit_items', label: 'Edit items', icon: Pencil }],
        danger: null,
      };
    case 'sent':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'current', timestamp: fmtShort(sentAt) },
          { label: 'Accepted', state: 'future' },
        ),
        whatsNext: 'Waiting for buyer response. Follow up if no reply in 3 days.',
        primary: { kind: 'accept', label: 'Mark accepted', icon: ThumbsUp },
        secondaries: [
          { kind: 'send_reminder', label: 'Send reminder', icon: Mail },
          { kind: 'edit_items', label: 'Edit', icon: Pencil },
        ],
        danger: { kind: 'decline', label: 'Mark declined', icon: ThumbsDown },
      };
    case 'accepted':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'done', timestamp: fmtShort(sentAt) },
          { label: 'Accepted', state: 'current', timestamp: fmtShort(acceptedAt) },
        ),
        whatsNext:
          'Buyer accepted. Convert to a Sales Order or directly to an Invoice.',
        primary: { kind: 'convert_order', label: 'Convert to Sales Order', icon: ShoppingCart },
        secondaries: [{ kind: 'convert_invoice', label: 'Convert to Invoice', icon: FileText }],
        danger: null,
      };
    case 'declined':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'done', timestamp: fmtShort(sentAt) },
          { label: 'Declined', state: 'cancelled' },
        ),
        whatsNext: 'Buyer declined. Duplicate with revised pricing if needed.',
        primary: { kind: 'duplicate', label: 'Duplicate as draft', icon: Copy },
        secondaries: [],
        danger: null,
      };
    case 'expired':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'done', timestamp: fmtShort(sentAt) },
          { label: 'Expired', state: 'skipped' },
        ),
        whatsNext: 'Estimate expired. Duplicate with a fresh validity window.',
        primary: { kind: 'duplicate', label: 'Duplicate as draft', icon: Copy },
        secondaries: [],
        danger: null,
      };
    case 'converted':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'done', timestamp: fmtShort(sentAt) },
          { label: 'Converted', state: 'done', timestamp: fmtShort(acceptedAt) },
        ),
        whatsNext: `Converted to Sales Order ${orderNumber ?? '—'}. Track it from there.`,
        primary: { kind: 'view_sales_order', label: 'View Sales Order', icon: ListChecks },
        secondaries: [],
        danger: null,
      };
    case 'invoiced':
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'done', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'done', timestamp: fmtShort(sentAt) },
          { label: 'Invoiced', state: 'done', timestamp: fmtShort(acceptedAt) },
        ),
        whatsNext: `Converted directly to Invoice ${invoiceNumber ?? '—'}.`,
        primary: { kind: 'view_invoice', label: 'View Invoice', icon: FileText },
        secondaries: [],
        danger: null,
      };
    default:
      return {
        steps: baseSteps(
          { label: 'Draft', state: 'current', timestamp: fmtShort(createdAt) },
          { label: 'Sent', state: 'future' },
          { label: 'Accepted', state: 'future' },
        ),
        whatsNext: 'Fill in the items and send to the buyer to get their decision.',
        primary: { kind: 'send', label: 'Send to buyer', icon: Send },
        secondaries: [{ kind: 'edit_items', label: 'Edit items', icon: Pencil }],
        danger: null,
      };
  }
}

/** Primary band CTA variant: terminal "view" actions use secondary styling per spec. */
export function primaryBandVariant(status: Exclude<EstimateDbStatus, 'pending'>): 'primary' | 'secondary' {
  if (status === 'converted' || status === 'invoiced') return 'secondary';
  return 'primary';
}

export function openEstimateStatuses(): Exclude<EstimateDbStatus, 'pending'>[] {
  return ['draft', 'sent', 'accepted'];
}

export function itemCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

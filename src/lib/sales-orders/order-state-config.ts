import type { LucideIcon } from 'lucide-react';
import { ClipboardList, Download, MessageCircle, Pencil, Truck, Upload, X } from 'lucide-react';
import type { TransactionalStatusBandStep } from '@/components/seller/transactional';
import type { StatusTone } from '@/components/seller/layout';
import type { SalesOrderLine, SalesOrderUiStatus } from '@/types/tenant-sales-orders';
import type { FulfilmentAlertLine } from '@/components/seller/transactional';

export interface SecondaryActionDef {
  label: string;
  icon: LucideIcon;
}

export function getShortLines(lines: SalesOrderLine[]): FulfilmentAlertLine[] {
  return lines
    .filter((l) => l.qty > l.on_hand)
    .map((l) => ({ name: l.name, onHand: l.on_hand, qty: l.qty }));
}

export function showFulfilmentAlert(ui: SalesOrderUiStatus): boolean {
  return ui === 'received' || ui === 'confirmed';
}

export function hasInvoicePanel(ui: SalesOrderUiStatus): boolean {
  return ui !== 'received' && ui !== 'cancelled';
}

export function getStatusPill(ui: SalesOrderUiStatus): { label: string; tone: StatusTone } {
  const map: Record<SalesOrderUiStatus, { label: string; tone: StatusTone }> = {
    received: { label: 'Received', tone: 'neutral' },
    confirmed: { label: 'Confirmed', tone: 'accent' },
    dispatched: { label: 'Dispatched', tone: 'warning' },
    delivered: { label: 'Delivered', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
  };
  return map[ui];
}

export function getWhatsNext(ui: SalesOrderUiStatus, shortLineCount: number): string {
  const shortSuffix =
    shortLineCount > 0
      ? ` ${shortLineCount} line(s) short — resolve first or confirm a partial.`
      : '';

  switch (ui) {
    case 'received':
      return `Confirm to reserve stock and generate the invoice.${shortSuffix}`;
    case 'confirmed':
      return 'Stock is reserved and the invoice is raised. Dispatch when the fleet is loaded.';
    case 'dispatched':
      return 'On the road with the distributor fleet. Mark delivered once the buyer signs.';
    case 'delivered':
      return 'Delivered and paid in full. Nothing pending — reorder for this buyer in a tap.';
    case 'cancelled':
      return 'Cancelled before dispatch. Reserved stock was released back to inventory.';
    default:
      return '';
  }
}

export function getStepperSteps(
  ui: SalesOrderUiStatus,
  ts: {
    received?: string;
    confirmed?: string;
    dispatched?: string;
    delivered?: string;
    cancelled?: string;
  },
): TransactionalStatusBandStep[] {
  if (ui === 'cancelled') {
    return [
      { label: 'Received', state: 'done', timestamp: ts.received },
      { label: 'Cancelled', state: 'cancelled', timestamp: ts.cancelled },
      { label: 'Dispatched', state: 'skipped' },
      { label: 'Delivered', state: 'skipped' },
    ];
  }

  const idx =
    ui === 'received'
      ? 0
      : ui === 'confirmed'
        ? 1
        : ui === 'dispatched'
          ? 2
          : 3;

  const labels = ['Received', 'Confirmed', 'Dispatched', 'Delivered'] as const;
  const stamps = [ts.received, ts.confirmed, ts.dispatched, ts.delivered];

  return labels.map((label, i) => {
    let state: TransactionalStatusBandStep['state'];
    if (i < idx) state = 'done';
    else if (i === idx) state = 'current';
    else state = 'future';
    return { label, state, timestamp: stamps[i] };
  });
}

export function getPrimaryAction(ui: SalesOrderUiStatus): { label: string; variant: 'primary' | 'secondary' } {
  switch (ui) {
    case 'received':
      return { label: 'Confirm order', variant: 'primary' };
    case 'confirmed':
      return { label: 'Mark dispatched', variant: 'primary' };
    case 'dispatched':
      return { label: 'Mark delivered', variant: 'primary' };
    case 'delivered':
      return { label: 'Reorder for buyer', variant: 'secondary' };
    case 'cancelled':
      return { label: 'Reorder for buyer', variant: 'secondary' };
    default:
      return { label: 'Confirm order', variant: 'primary' };
  }
}

export function getSecondaryActions(ui: SalesOrderUiStatus): SecondaryActionDef[] {
  switch (ui) {
    case 'received':
      return [
        { label: 'Edit order', icon: Pencil },
        { label: 'Message buyer', icon: MessageCircle },
      ];
    case 'confirmed':
      return [
        { label: 'Download invoice', icon: Download },
        { label: 'Edit order', icon: Pencil },
      ];
    case 'dispatched':
      return [
        { label: 'Track shipment', icon: Truck },
        { label: 'Download invoice', icon: Download },
      ];
    case 'delivered':
      return [
        { label: 'Download invoice', icon: Download },
        { label: 'Export to Tally', icon: Upload },
      ];
    case 'cancelled':
      return [{ label: 'View reason', icon: ClipboardList }];
    default:
      return [];
  }
}

export function getDangerAction(ui: SalesOrderUiStatus): { label: string; icon: LucideIcon } | null {
  if (ui === 'received' || ui === 'confirmed') {
    return { label: 'Cancel order', icon: X };
  }
  return null;
}

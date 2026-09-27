'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DialogBody } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { priceListsEqual } from '@/lib/buy-as';
import { writeStoredBuyAsBuyerId } from '@/lib/buy-as-storage';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useBuyerSiblings } from '@/hooks/useBuyerSiblings';

function invalidateBuyerPricingQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['buyer-me'] });
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && (
        key.startsWith('buyer-catalog')
        || key.startsWith('buyer-product')
        || key.startsWith('buyer-resolved')
      );
    },
  });
}

export function BuyAsPicker(): React.ReactNode {
  const queryClient = useQueryClient();
  const { data: me } = useBuyerMe();
  const { data: siblings } = useBuyerSiblings(me?.mode === 'buyer');
  const [pendingBuyerId, setPendingBuyerId] = React.useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<{
    buyerId: string;
    businessName: string;
  } | null>(null);
  const [switching, setSwitching] = React.useState(false);

  const currentBuyerId = me?.buyer_id ?? null;
  const tenantId = me?.tenant?.id ?? null;

  if (!siblings || siblings.length <= 1 || !currentBuyerId || !tenantId) {
    return null;
  }

  const currentSibling = siblings.find((row) => row.buyer_id === currentBuyerId) ?? siblings[0];

  async function remintBuyer(buyerId: string): Promise<boolean> {
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/switch-buyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId }),
      });
      const data: {
        session?: { access_token: string; refresh_token: string };
        error?: string;
      } = await res.json();

      if (!res.ok || !data.session) {
        toast.error(data.error ?? 'Could not switch buyer account.');
        return false;
      }

      await supabaseBrowser.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      writeStoredBuyAsBuyerId(tenantId!, buyerId);
      invalidateBuyerPricingQueries(queryClient);
      return true;
    } catch {
      toast.error('Network error. Please try again.');
      return false;
    } finally {
      setSwitching(false);
      setPendingBuyerId(null);
    }
  }

  async function handleValueChange(nextBuyerId: string) {
    if (nextBuyerId === currentBuyerId || switching) return;

    const target = siblings!.find((row) => row.buyer_id === nextBuyerId);
    if (!target) return;

    const sameList = priceListsEqual(currentSibling.price_list_id, target.price_list_id);

    if (sameList) {
      setPendingBuyerId(nextBuyerId);
      await remintBuyer(nextBuyerId);
      return;
    }

    setPendingBuyerId(nextBuyerId);
    setConfirmTarget({ buyerId: nextBuyerId, businessName: target.business_name });
  }

  async function handleConfirmSwitch() {
    if (!confirmTarget) return;
    const ok = await remintBuyer(confirmTarget.buyerId);
    if (ok) setConfirmTarget(null);
  }

  function handleCancelSwitch() {
    setConfirmTarget(null);
    setPendingBuyerId(null);
  }

  const selectValue = pendingBuyerId && !confirmTarget ? pendingBuyerId : currentBuyerId;

  return (
    <>
      <div className="px-4 py-3 md:px-0">
        <Select
          value={selectValue}
          onValueChange={handleValueChange}
          disabled={switching}
        >
          <SelectTrigger label="Buy As" className="bg-white">
            <SelectValue placeholder="Select business" />
          </SelectTrigger>
          <SelectContent>
            {siblings.map((row) => (
              <SelectItem key={row.buyer_id} value={row.buyer_id}>
                {row.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AlertDialog open={Boolean(confirmTarget)} onOpenChange={(open) => { if (!open) handleCancelSwitch(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Different negotiated prices</AlertDialogTitle>
          </AlertDialogHeader>
          <DialogBody>
            <AlertDialogDescription>
              {confirmTarget
                ? `${confirmTarget.businessName} has different negotiated prices. Item prices in this cart will update.`
                : null}
            </AlertDialogDescription>
          </DialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={switching} onClick={() => void handleConfirmSwitch()}>
              {switching ? 'Switching…' : 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

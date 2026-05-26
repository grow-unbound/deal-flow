'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineItemEditor } from '@/components/seller/price-lists/LineItemEditor';
import { AssignmentsPanel } from '@/components/seller/price-lists/AssignmentsPanel';
import { Switch } from '@/components/ui/switch';
import { PriceListStatusBadge } from '@/components/seller/price-lists/PriceListStatusBadge';
import { ROLES } from '@/constants';
import { usePriceListDetail, useTogglePriceListActive } from '@/hooks/usePriceLists';
import { useRole } from '@/hooks/useRole';

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePriceListDetail(id);
  const { mutate: toggle, isPending: isToggling } = useTogglePriceListActive();
  const { isSellerAdmin } = useRole();

  const priceList = data?.price_list;
  const title = isLoading
    ? 'Price List'
    : (priceList?.name ?? 'Price List');

  const backButton = (
    <Link
      href="/price-lists"
      className="flex items-center gap-1.5 text-sm text-cream-600 hover:text-cream-900 transition-colors"
    >
      <ArrowLeft size={14} />
      Back to Price Lists
    </Link>
  );

  return (
    <div className="px-8 py-6">
      <SellerTopbar title={title} action={backButton} />
        <FeatureGate flag="PRICING_ENGINE">
          <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
            {isLoading ? (
              <p className="text-cream-500 text-sm">Loading…</p>
            ) : !priceList ? (
              <p className="text-red-600 text-sm">Price list not found.</p>
            ) : (
              <>
              <div className="flex items-center gap-3 mb-6">
                <PriceListStatusBadge
                  is_active={priceList.is_active}
                  valid_from={priceList.valid_from}
                  valid_to={priceList.valid_to}
                />
                {isSellerAdmin && (
                  <Switch
                    checked={priceList.is_active}
                    onCheckedChange={(val) => toggle({ id, is_active: val })}
                    label="Active"
                    disabled={isToggling}
                  />
                )}
              </div>

              <Tabs defaultValue="items" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="items">Line Items</TabsTrigger>
                  <TabsTrigger value="assignments">Assignments</TabsTrigger>
                </TabsList>

                <TabsContent value="items">
                  <LineItemEditor priceListId={id} />
                </TabsContent>

                <TabsContent value="assignments">
                  <AssignmentsPanel priceListId={id} />
                </TabsContent>
              </Tabs>
              </>
            )}
          </RoleGuard>
        </FeatureGate>
    </div>
  );
}

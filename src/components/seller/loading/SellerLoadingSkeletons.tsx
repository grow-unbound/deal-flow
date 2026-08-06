import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import { cn } from '@/lib/utils';

function PulseLine({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded bg-cream-200', className)} />;
}

function PulseCard({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded-[14px] border border-cream-200 bg-cream-100', className)} />;
}

export function SellerPageHeaderSkeleton({
  eyebrowWidth = 'w-20',
  titleWidth = 'w-44',
  subtitleWidth = 'w-[36rem] max-w-full',
  actionWidths = ['w-36'],
  compact = false,
}: {
  eyebrowWidth?: string;
  titleWidth?: string;
  subtitleWidth?: string;
  actionWidths?: string[];
  compact?: boolean;
}) {
  return (
    <header className="mb-3 flex items-end justify-between gap-4 md:mb-4 md:gap-6">
      <div className="min-w-0 flex-1">
        <PulseLine className={cn('h-3', eyebrowWidth)} />
        <PulseLine className={cn('mt-1 h-6 md:h-7', titleWidth)} />
        <PulseLine className={cn('mt-1 h-4 md:h-5', subtitleWidth)} />
      </div>
      <div className="hidden shrink-0 items-center gap-2 pb-0.5 md:flex">
        {actionWidths.map((width, index) => (
          <PulseCard key={index} className={cn(compact ? 'h-9 w-9 rounded-[10px]' : 'h-9 rounded-[10px]', width)} />
        ))}
      </div>
    </header>
  );
}

export function TableRowsSkeleton({
  gridClassName,
  rowCount = 14,
  cellCount,
  cellHeight = 'h-10 rounded-md',
}: {
  gridClassName: string;
  rowCount?: number;
  cellCount: number;
  cellHeight?: string;
}) {
  return (
    <div className="min-h-[calc(100dvh-var(--topbar-h)-20rem)] overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
      <div className="space-y-3 p-4">
        {Array.from({ length: rowCount }).map((_, row) => (
          <div key={row} className={cn('grid gap-3', gridClassName)}>
            {Array.from({ length: cellCount }).map((_, col) => (
              <PulseCard key={col} className={cellHeight} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SellerTableLandingSkeleton({
  ariaLabel,
  eyebrowWidth = 'w-20',
  titleWidth = 'w-44',
  descriptionWidth = 'w-[36rem] max-w-full',
  kpiCardHeight = 'h-36',
  tableColumnGridClassName,
  tableColumnCount,
  tableRowCount = 6,
  tableCellHeight = 'h-10 rounded-md',
  className,
}: {
  ariaLabel: string;
  eyebrowWidth?: string;
  titleWidth?: string;
  descriptionWidth?: string;
  kpiCardHeight?: string;
  tableColumnGridClassName: string;
  tableColumnCount: number;
  tableRowCount?: number;
  tableCellHeight: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1920px] px-8 py-6', className)} role="status" aria-label={ariaLabel}>
      <div className="flex min-h-[calc(100dvh-var(--topbar-h)-3rem)] flex-col space-y-5">
        <SellerPageHeaderSkeleton
          eyebrowWidth={eyebrowWidth}
          titleWidth={titleWidth}
          subtitleWidth={descriptionWidth}
        />

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <PulseCard key={index} className={cn(kpiCardHeight, 'rounded-[14px]')} />
          ))}
        </div>

        <PulseCard className="h-14 rounded-[14px]" />

        <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className={cn('grid gap-3 border-b border-cream-200 px-5 py-3', tableColumnGridClassName)}>
            {Array.from({ length: tableColumnCount }).map((_, index) => (
              <PulseLine key={index} className="h-3 w-full" />
            ))}
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: Math.max(tableRowCount, 14) }).map((_, row) => (
              <div key={row} className={cn('grid gap-3', tableColumnGridClassName)}>
                {Array.from({ length: tableColumnCount }).map((_, col) => (
                  <PulseCard key={col} className={tableCellHeight} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SellerDashboardLoadingSkeleton({
  ariaLabel = 'Loading dashboard',
  widgetCount = 5,
  hero = false,
}: {
  ariaLabel?: string;
  widgetCount?: number;
  hero?: boolean;
}) {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label={ariaLabel}>
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="space-y-2">
          <PulseLine className="h-3 w-24" />
          <PulseLine className="h-8 w-44" />
          <PulseLine className="h-4 w-[36rem] max-w-full" />
        </div>
        <PulseCard className="h-9 w-40 rounded-[10px]" />
      </div>

      {hero ? <PulseCard className="mb-5 h-24 rounded-[12px]" /> : null}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <PulseCard key={index} className="h-[108px] rounded-[12px]" />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: widgetCount }).map((_, index) => (
          <PulseCard key={index} className="h-[320px]" />
        ))}
      </div>
    </div>
  );
}

export function SellerEntityDetailSkeleton({
  ariaLabel,
  titleWidth,
  subtitleWidth,
  actionWidths,
  avatarClassName,
  kpiCardClassName,
  kpiCount,
  tabCount,
  tabWidth,
  contentHeightClassName,
  className,
}: {
  ariaLabel: string;
  titleWidth: string;
  subtitleWidth: string;
  actionWidths: string[];
  avatarClassName: string;
  kpiCardClassName: string;
  kpiCount: number;
  tabCount: number;
  tabWidth: string;
  contentHeightClassName: string;
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-4 md:px-6 md:py-4 space-y-6', className)} role="status" aria-label={ariaLabel}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PulseCard className={avatarClassName} />
            <div className="space-y-2">
              <PulseLine className={titleWidth} />
              <PulseLine className={subtitleWidth} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actionWidths.map((width, index) => (
              <PulseLine key={index} className={width} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: kpiCount }).map((_, index) => (
          <PulseCard key={index} className={kpiCardClassName} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: tabCount }).map((_, index) => (
          <PulseLine key={index} className={cn(tabWidth, 'h-9 rounded-full')} />
        ))}
      </div>

      <PulseCard className={contentHeightClassName} />
    </div>
  );
}

export function DashboardSkeleton() {
  return <SellerDashboardLoadingSkeleton />;
}

export function BuyerAppSkeleton() {
  return <SellerDashboardLoadingSkeleton ariaLabel="Loading buyer app" widgetCount={4} hero />;
}

export function WorkboardLandingSkeleton({
  ariaLabel,
  titleWidth = 'h-8 w-40',
  descriptionWidth = 'h-4 w-[30rem]',
  topCardHeight = 'h-[108px]',
  tableColumnGridClassName = 'grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_40px]',
  tableColumnCount = 7,
  tableRowCount = 6,
}: {
  ariaLabel: string;
  titleWidth?: string;
  descriptionWidth?: string;
  topCardHeight?: string;
  tableColumnGridClassName?: string;
  tableColumnCount?: number;
  tableRowCount?: number;
}) {
  return (
    <SellerTableLandingSkeleton
      ariaLabel={ariaLabel}
      titleWidth={titleWidth}
      descriptionWidth={descriptionWidth}
      kpiCardHeight={topCardHeight}
      tableColumnGridClassName={tableColumnGridClassName}
      tableColumnCount={tableColumnCount}
      tableRowCount={tableRowCount}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function CatalogLandingSkeleton({
  ariaLabel,
  eyebrowWidth,
  titleWidth,
  descriptionWidth,
  topCardHeight,
  tableHeaderGridClassName,
  tableRowCount,
  tableCellCount,
  tableCellHeight,
}: {
  ariaLabel: string;
  eyebrowWidth?: string;
  titleWidth: string;
  descriptionWidth: string;
  topCardHeight: string;
  tableHeaderGridClassName: string;
  tableRowCount: number;
  tableCellCount: number;
  tableCellHeight: string;
}) {
  return (
    <SellerTableLandingSkeleton
      ariaLabel={ariaLabel}
      eyebrowWidth={eyebrowWidth}
      titleWidth={titleWidth}
      descriptionWidth={descriptionWidth}
      kpiCardHeight={topCardHeight}
      tableColumnGridClassName={tableHeaderGridClassName}
      tableColumnCount={tableCellCount}
      tableRowCount={tableRowCount}
      tableCellHeight={tableCellHeight}
    />
  );
}

export function CustomersLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading customers"
      eyebrowWidth="w-24"
      titleWidth="w-52"
      descriptionWidth="w-[40rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.6fr_0.85fr_0.7fr_0.9fr_0.7fr_0.85fr_0.7fr_0.9fr_0.7fr_0.85fr_0.8fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={12}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function ProductsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading products"
      eyebrowWidth="w-16"
      titleWidth="w-44"
      descriptionWidth="w-[36rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_40px]"
      tableRowCount={6}
      tableCellCount={9}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function BrandsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading brands"
      eyebrowWidth="w-20"
      titleWidth="w-32"
      descriptionWidth="w-[34rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableRowCount={6}
      tableCellCount={6}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function LocationsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading locations"
      eyebrowWidth="w-24"
      titleWidth="w-36"
      descriptionWidth="w-[30rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_1fr_0.9fr_0.8fr_0.9fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={7}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function WarehousesLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading warehouses"
      eyebrowWidth="w-24"
      titleWidth="w-40"
      descriptionWidth="w-[34rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_1.1fr_1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={8}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function CategoriesLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading categories"
      eyebrowWidth="w-16"
      titleWidth="w-40"
      descriptionWidth="w-[28rem] max-w-full"
      topCardHeight="h-[108px] rounded-[12px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={5}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function CohortsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading cohorts"
      eyebrowWidth="w-28"
      titleWidth="w-52"
      descriptionWidth="w-[44rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={3}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function PriceListsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading price lists"
      eyebrowWidth="w-20"
      titleWidth="w-44"
      descriptionWidth="w-[40rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1.05fr_0.85fr_0.85fr_0.8fr_40px]"
      tableRowCount={6}
      tableCellCount={8}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function CatalogsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading campaigns"
      eyebrowWidth="w-20"
      titleWidth="w-44"
      descriptionWidth="w-[36rem] max-w-full"
      topCardHeight="h-36 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableRowCount={6}
      tableCellCount={6}
      tableCellHeight="h-10 rounded-md"
    />
  );
}

export function EstimatesLandingSkeleton() {
  return <WorkboardLandingSkeleton ariaLabel="Loading estimates" />;
}

export function InvoicesLandingSkeleton() {
  return <WorkboardLandingSkeleton ariaLabel="Loading invoices" />;
}

export function SalesOrdersLandingSkeleton() {
  return <WorkboardLandingSkeleton ariaLabel="Loading sales orders" />;
}

export function CustomerDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading customer detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 w-80"
      actionWidths={['h-9 w-28 rounded-[8px]', 'h-9 w-24 rounded-[8px]', 'h-9 w-24 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={8}
      tabWidth="w-28"
      contentHeightClassName="h-[24rem] rounded-[14px]"
    />
  );
}

export function ProductDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading product detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 w-80"
      actionWidths={['h-9 w-24 rounded-[8px]', 'h-9 w-24 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={4}
      tabWidth="w-32"
      contentHeightClassName="h-[28rem] rounded-[14px]"
    />
  );
}

export function BrandDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading brand detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 w-80"
      actionWidths={['h-9 w-9 rounded-[8px]', 'h-9 w-24 rounded-[8px]', 'h-9 w-24 rounded-[8px]', 'h-9 w-44 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-full"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={3}
      tabWidth="w-28"
      contentHeightClassName="h-[24rem] rounded-[14px]"
    />
  );
}

export function LocationDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading location detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 max-w-md"
      actionWidths={['h-9 w-20 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={7}
      tabWidth="w-28"
      contentHeightClassName="h-[26rem] rounded-[14px]"
    />
  );
}

export function WarehouseDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading warehouse detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 max-w-md"
      actionWidths={['h-9 w-32 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={3}
      tabWidth="w-28"
      contentHeightClassName="h-[26rem] rounded-[14px]"
    />
  );
}

export function CategoryDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading category detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 w-80"
      actionWidths={[]}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={4}
      tabWidth="w-24"
      contentHeightClassName="h-[24rem] rounded-[14px]"
    />
  );
}

export function CohortDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading cohort detail"
      titleWidth="h-7 w-56"
      subtitleWidth="h-4 w-80"
      actionWidths={['h-9 w-[8.5rem] rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-full"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={2}
      tabWidth="w-28"
      contentHeightClassName="h-[24rem] rounded-[14px]"
    />
  );
}

export function PriceListDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading price list detail"
      titleWidth="h-12 w-96"
      subtitleWidth="h-4 w-[42rem]"
      actionWidths={['h-10 w-56 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-[112px] rounded-[14px]"
      kpiCount={4}
      tabCount={1}
      tabWidth="w-28"
      contentHeightClassName="h-[26rem] rounded-[14px]"
    />
  );
}

export function CatalogDetailSkeleton() {
  return (
    <SellerEntityDetailSkeleton
      ariaLabel="Loading catalog detail"
      titleWidth="h-7 w-64"
      subtitleWidth="h-4 max-w-md"
      actionWidths={['h-9 w-32 rounded-[8px]', 'h-9 w-36 rounded-[8px]']}
      avatarClassName="h-12 w-12 rounded-[14px]"
      kpiCardClassName="h-28 rounded-[14px]"
      kpiCount={4}
      tabCount={3}
      tabWidth="w-28"
      contentHeightClassName="h-[28rem] rounded-[14px]"
    />
  );
}

export function DocumentComposerLoadingSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading document composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-b border-cream-300 px-3 py-2 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0">
              <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-28 animate-pulse rounded bg-cream-100" />
            </div>
          ))}
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0">
              <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-cream-100" />
              {index === 0 ? <div className="mt-2 h-3 w-28 animate-pulse rounded bg-cream-100" /> : null}
            </div>
          ))}
        </div>
        <div className="min-h-[22rem] animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        <div className="min-h-[9rem] animate-pulse rounded-[14px] border border-cream-300 bg-white" />
      </div>
      <div className="sticky bottom-0 z-10 mt-4 shrink-0 rounded-[14px] border border-cream-300 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(34,52,43,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-10 w-32 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentDetailLoadingSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading document details"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-b border-cream-300 px-3 py-3 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0">
              <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-cream-100" />
              {index === 0 ? <div className="mt-2 h-3 w-28 animate-pulse rounded bg-cream-100" /> : null}
            </div>
          ))}
        </div>
        <div className="min-h-[22rem] animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        <div className="min-h-[10rem] animate-pulse rounded-[14px] border border-cream-300 bg-white" />
      </div>
    </div>
  );
}

export function CatalogComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading campaign composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 h-20 shrink-0 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
    </div>
  );
}

export function CohortComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading customer group composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 h-20 shrink-0 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
    </div>
  );
}

export function PriceListComposerSkeleton() {
  return (
    <div
      className={cn('mx-auto flex w-full max-w-[1920px] flex-col px-8 py-6', composerPageMinHeightClass)}
      role="status"
      aria-label="Loading price list composer"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-cream-200 bg-cream-100">
        <div className="h-16 shrink-0 animate-pulse border-b border-cream-200 bg-cream-100" />
        <div className="shrink-0 space-y-5 border-b border-cream-200 px-6 py-5">
          <div className="h-10 w-72 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[44rem] animate-pulse rounded bg-cream-200" />
          <div className="grid gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[108px] animate-pulse rounded-[16px] border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse border-r border-cream-200 bg-cream-100" />
          <div className="animate-pulse bg-cream-100" />
          <div className="animate-pulse border-l border-cream-200 bg-cream-100" />
        </div>
        <div className="h-20 shrink-0 animate-pulse border-t border-cream-200 bg-cream-50" />
      </div>
    </div>
  );
}

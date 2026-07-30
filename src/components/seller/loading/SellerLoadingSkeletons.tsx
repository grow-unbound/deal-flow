import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';
import { cn } from '@/lib/utils';

function PulseLine({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded bg-cream-200', className)} />;
}

function PulseCard({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded-[14px] border border-cream-200 bg-cream-100', className)} />;
}

export function TableRowsSkeleton({
  gridClassName,
  rowCount = 6,
  cellCount,
  cellHeight = 'h-10 rounded-md',
}: {
  gridClassName: string;
  rowCount?: number;
  cellCount: number;
  cellHeight?: string;
}) {
  return (
    <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
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

function LandingSkeleton({
  ariaLabel,
  titleWidth,
  descriptionWidth,
  topGridClassName,
  topCount,
  topCardHeight,
  midGridClassName,
  midCount,
  midCardHeight,
  tableHeaderGridClassName,
  tableHeaderCount,
  tableRowGridClassName,
  tableRowCount,
  tableCellCount,
  tableCellHeight,
  tablePanelHeight,
}: {
  ariaLabel: string;
  titleWidth: string;
  descriptionWidth: string;
  topGridClassName: string;
  topCount: number;
  topCardHeight: string;
  midGridClassName: string;
  midCount: number;
  midCardHeight: string;
  tableHeaderGridClassName: string;
  tableHeaderCount: number;
  tableRowGridClassName: string;
  tableRowCount: number;
  tableCellCount: number;
  tableCellHeight: string;
  tablePanelHeight: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 py-6" role="status" aria-label={ariaLabel}>
      <div className="space-y-5">
        <div className="space-y-3">
          <PulseLine className={titleWidth} />
          <PulseLine className={descriptionWidth} />
        </div>

        <div className={topGridClassName}>
          {Array.from({ length: topCount }).map((_, index) => (
            <PulseCard key={index} className={topCardHeight} />
          ))}
        </div>

        <div className={midGridClassName}>
          {Array.from({ length: midCount }).map((_, index) => (
            <PulseCard key={index} className={midCardHeight} />
          ))}
        </div>

        <PulseCard className="h-14" />

        <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className={cn('grid gap-3 border-b border-cream-200 px-5 py-3', tableHeaderGridClassName)}>
            {Array.from({ length: tableHeaderCount }).map((_, index) => (
              <PulseLine key={index} className="h-3 w-full" />
            ))}
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: tableRowCount }).map((_, row) => (
              <div key={row} className={cn('grid gap-3', tableRowGridClassName)}>
                {Array.from({ length: tableCellCount }).map((_, col) => (
                  <PulseCard key={col} className={tableCellHeight} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className={tablePanelHeight} />
      </div>
    </div>
  );
}

function DetailSkeleton({
  ariaLabel,
  breadcrumbWidth,
  titleWidth,
  subtitleWidth,
  actionWidths,
  avatarClassName,
  kpiCardClassName,
  kpiCount,
  tabCount,
  tabWidth,
  contentHeightClassName,
}: {
  ariaLabel: string;
  breadcrumbWidth: string;
  titleWidth: string;
  subtitleWidth: string;
  actionWidths: string[];
  avatarClassName: string;
  kpiCardClassName: string;
  kpiCount: number;
  tabCount: number;
  tabWidth: string;
  contentHeightClassName: string;
}) {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6 space-y-6" role="status" aria-label={ariaLabel}>
      <div className="space-y-3">
        <PulseLine className={breadcrumbWidth} />
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
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading dashboard">
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="space-y-2">
          <PulseLine className="h-3 w-24" />
          <PulseLine className="h-8 w-44" />
          <PulseLine className="h-4 w-[36rem]" />
        </div>
        <PulseCard className="h-9 w-40" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <PulseCard key={index} className="h-[108px]" />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <PulseCard key={index} className="h-[320px]" />
        ))}
      </div>
    </div>
  );
}

export function BuyerAppSkeleton() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading buyer app">
      <PulseCard className="h-24 rounded-[12px]" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <PulseCard key={index} className="h-[108px] rounded-[12px]" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <PulseCard key={index} className="h-[190px] rounded-[14px]" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <PulseCard key={index} className="h-[260px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

export function WorkboardLandingSkeleton({
  ariaLabel,
  titleWidth,
  descriptionWidth,
  topCardHeight = 'h-[108px]',
  midCardHeight = 'h-[190px]',
  tableHeight = 'h-[420px]',
}: {
  ariaLabel: string;
  titleWidth?: string;
  descriptionWidth?: string;
  topCardHeight?: string;
  midCardHeight?: string;
  tableHeight?: string;
}) {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label={ariaLabel}>
      <PulseCard className="h-24 rounded-[12px]" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <PulseCard key={index} className={cn(topCardHeight, 'rounded-[12px]')} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <PulseCard key={index} className={cn(midCardHeight, 'rounded-[14px]')} />
        ))}
      </div>
      <div className="mt-5 h-[46px] rounded-[12px] border border-cream-200 bg-cream-100 animate-pulse" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className={cn(tableHeight, 'animate-pulse bg-cream-50')} />
      </div>
    </div>
  );
}

export function CatalogLandingSkeleton({
  ariaLabel,
  titleWidth,
  descriptionWidth,
  topGridClassName,
  topCount,
  topCardHeight,
  midGridClassName,
  midCount,
  midCardHeight,
  tableHeaderGridClassName,
  tableHeaderCount,
  tableRowGridClassName,
  tableRowCount,
  tableCellCount,
  tableCellHeight,
  tablePanelHeight,
}: {
  ariaLabel: string;
  titleWidth: string;
  descriptionWidth: string;
  topGridClassName: string;
  topCount: number;
  topCardHeight: string;
  midGridClassName: string;
  midCount: number;
  midCardHeight: string;
  tableHeaderGridClassName: string;
  tableHeaderCount: number;
  tableRowGridClassName: string;
  tableRowCount: number;
  tableCellCount: number;
  tableCellHeight: string;
  tablePanelHeight: string;
}) {
  return (
    <LandingSkeleton
      ariaLabel={ariaLabel}
      titleWidth={titleWidth}
      descriptionWidth={descriptionWidth}
      topGridClassName={topGridClassName}
      topCount={topCount}
      topCardHeight={topCardHeight}
      midGridClassName={midGridClassName}
      midCount={midCount}
      midCardHeight={midCardHeight}
      tableHeaderGridClassName={tableHeaderGridClassName}
      tableHeaderCount={tableHeaderCount}
      tableRowGridClassName={tableRowGridClassName}
      tableRowCount={tableRowCount}
      tableCellCount={tableCellCount}
      tableCellHeight={tableCellHeight}
      tablePanelHeight={tablePanelHeight}
    />
  );
}

export function CustomersLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading customers"
      titleWidth="h-3 w-24"
      descriptionWidth="h-10 w-52"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_1.1fr_1.25fr_0.9fr_0.8fr_0.95fr_0.8fr_0.9fr_0.9fr_40px]"
      tableHeaderCount={9}
      tableRowGridClassName="grid-cols-[1.8fr_1.1fr_1.25fr_0.9fr_0.8fr_0.95fr_0.8fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={9}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function ProductsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading products"
      titleWidth="h-7 w-44"
      descriptionWidth="h-4 w-[36rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_40px]"
      tableHeaderCount={9}
      tableRowGridClassName="grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_40px]"
      tableRowCount={6}
      tableCellCount={9}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function BrandsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading brands"
      titleWidth="h-7 w-44"
      descriptionWidth="h-4 w-[36rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableHeaderCount={6}
      tableRowGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableRowCount={6}
      tableCellCount={6}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function LocationsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading locations"
      titleWidth="h-7 w-36"
      descriptionWidth="h-4 w-[32rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_1fr_0.9fr_0.8fr_0.9fr_0.9fr_0.9fr_40px]"
      tableHeaderCount={7}
      tableRowGridClassName="grid-cols-[1.8fr_1fr_0.9fr_0.8fr_0.9fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={7}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function WarehousesLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading warehouses"
      titleWidth="h-7 w-40"
      descriptionWidth="h-4 w-[34rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_1.1fr_1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_40px]"
      tableHeaderCount={8}
      tableRowGridClassName="grid-cols-[1.8fr_1.1fr_1fr_0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={8}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function CategoriesLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading categories"
      titleWidth="h-24 w-full max-w-sm"
      descriptionWidth="h-24 w-full max-w-sm"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-[108px] rounded-[12px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-[190px] rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr_0.9fr_40px]"
      tableHeaderCount={5}
      tableRowGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={5}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function CohortsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading cohorts"
      titleWidth="h-7 w-44"
      descriptionWidth="h-4 w-[36rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_40px]"
      tableHeaderCount={3}
      tableRowGridClassName="grid-cols-[1.8fr_0.9fr_0.9fr_40px]"
      tableRowCount={6}
      tableCellCount={3}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function PriceListsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading price lists"
      titleWidth="h-7 w-44"
      descriptionWidth="h-4 w-[40rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1.05fr_0.85fr_0.85fr_0.8fr_40px]"
      tableHeaderCount={8}
      tableRowGridClassName="grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1.05fr_0.85fr_0.85fr_0.8fr_40px]"
      tableRowCount={6}
      tableCellCount={8}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
    />
  );
}

export function CatalogsLandingSkeleton() {
  return (
    <CatalogLandingSkeleton
      ariaLabel="Loading campaigns"
      titleWidth="h-7 w-44"
      descriptionWidth="h-4 w-[36rem]"
      topGridClassName="grid grid-cols-4 gap-3"
      topCount={4}
      topCardHeight="h-36 rounded-[14px]"
      midGridClassName="grid grid-cols-3 gap-3"
      midCount={3}
      midCardHeight="h-52 rounded-[14px]"
      tableHeaderGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableHeaderCount={6}
      tableRowGridClassName="grid-cols-[1.8fr_0.8fr_0.8fr_1fr_0.9fr_1fr_40px]"
      tableRowCount={6}
      tableCellCount={6}
      tableCellHeight="h-10 rounded-md"
      tablePanelHeight="h-0"
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
    <DetailSkeleton
      ariaLabel="Loading customer detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading product detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading brand detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading location detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading warehouse detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading category detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading cohort detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading price list detail"
      breadcrumbWidth="h-4 w-52"
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
    <DetailSkeleton
      ariaLabel="Loading catalog detail"
      breadcrumbWidth="h-6 w-56"
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
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white p-4" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
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

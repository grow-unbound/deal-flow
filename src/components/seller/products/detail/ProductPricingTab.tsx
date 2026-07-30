'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityAvatar, FilterBar, LandingTable, type FilterBarGroup } from '@/components/seller/layout';
import {
  MemberToggle,
  MembershipBulkActionBar,
  RowSelectCheckbox,
  SelectableRow,
  SelectAllCheckbox,
  useSelectableRows,
} from '@/components/seller/shared/SelectableMembershipTable';
import type { ProductDetailResponse } from '@/hooks/useProducts';
import { useProductPriceListItemMutations } from '@/hooks/useProducts';
import { useDebounce } from '@/hooks/useDebounce';
import { PriceListStatusBadge } from '@/components/seller/price-lists/PriceListStatusBadge';
import { cn, formatDate, formatNumberInput, formatNumberValue, parseNumberInput } from '@/lib/utils';

interface ProductPricingTabProps {
  productId: string;
  role: string;
  pricingSummary: ProductDetailResponse['detail']['pricing_summary'];
  pricing: ProductDetailResponse['detail']['pricing'];
}

type PricingRow = ProductDetailResponse['detail']['pricing'][number];

type SortOption =
  | 'Pricelist (A → Z)'
  | 'List price (high → low)'
  | 'Avg discount (high → low)'
  | 'Avg margin (high → low)';

const MEMBER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'expired', label: 'Expired' },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ProductPricingTab({ productId, role, pricingSummary, pricing }: ProductPricingTabProps) {
  const isAdmin = role === 'seller_admin';
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('Pricelist (A → Z)');
  const [editingPriceListId, setEditingPriceListId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const { updateItem, addItem, removeItem } = useProductPriceListItemMutations(productId, false);
  const isPending = updateItem.isPending || addItem.isPending || removeItem.isPending;
  const isInterim = search.trim() !== debouncedSearch.trim();

  const rows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    let next = pricing.filter((row) => {
      if (query && !row.price_list_name.toLowerCase().includes(query)) return false;
      if (member === 'yes' && !row.item_id) return false;
      if (member === 'no' && row.item_id) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });

    next = [...next].sort((a, b) => {
      if (sortBy === 'List price (high → low)') {
        return Number(b.list_price ?? -1) - Number(a.list_price ?? -1);
      }
      if (sortBy === 'Avg discount (high → low)') {
        return Number(b.avg_discount_pct ?? -1) - Number(a.avg_discount_pct ?? -1);
      }
      if (sortBy === 'Avg margin (high → low)') {
        return Number(b.avg_margin_pct ?? -1) - Number(a.avg_margin_pct ?? -1);
      }
      return a.price_list_name.localeCompare(b.price_list_name);
    });

    return next;
  }, [debouncedSearch, member, pricing, sortBy, statusFilter]);

  const selection = useSelectableRows(rows, (row) => row.price_list_id);

  useEffect(() => {
    selection.clearSelection();
  }, [member, statusFilter, debouncedSearch, sortBy, selection.clearSelection]);

  const memberCount = useMemo(() => pricing.filter((row) => row.item_id).length, [pricing]);

  const filterGroups: FilterBarGroup[] = [
    {
      key: 'member',
      label: 'Member',
      options: MEMBER_OPTIONS,
      values: [member],
      onChange: (values) => setMember(values.at(-1) ?? 'all'),
    },
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS,
      values: [statusFilter],
      onChange: (values) => setStatusFilter(values.at(-1) ?? 'all'),
    },
  ];

  function beginEdit(row: PricingRow) {
    if (row.is_managed_externally || !isAdmin) return;
    setEditingPriceListId(row.price_list_id);
    if (row.list_price != null) {
      setDraftPrice(formatNumberInput(row.list_price, 'CURRENCY_EXACT'));
      return;
    }
    const seed = pricingSummary.base_selling_price;
    setDraftPrice(seed != null ? formatNumberInput(seed, 'CURRENCY_EXACT') : '');
  }

  async function saveEdit(row: PricingRow) {
    const parsed = parseNumberInput(draftPrice, 'CURRENCY_EXACT');
    if (parsed == null || parsed <= 0) return;
    if (row.item_id) {
      await updateItem.mutateAsync({ priceListId: row.price_list_id, itemId: row.item_id, price: parsed });
    } else {
      await addItem.mutateAsync({ priceListId: row.price_list_id, price: parsed });
    }
    setEditingPriceListId(null);
    setDraftPrice('');
  }

  async function handleBulkInclude() {
    const basePrice = Number(pricingSummary.base_selling_price ?? 0);
    if (basePrice <= 0) return;
    const targets = rows.filter(
      (row) => selection.selectedIds.includes(row.price_list_id) && !row.item_id && !row.is_managed_externally,
    );
    for (const row of targets) {
      await addItem.mutateAsync({ priceListId: row.price_list_id, price: basePrice });
    }
    selection.clearSelection();
  }

  async function handleBulkRemove() {
    const targets = rows.filter(
      (row) => selection.selectedIds.includes(row.price_list_id) && row.item_id && !row.is_managed_externally,
    );
    for (const row of targets) {
      if (!row.item_id) continue;
      await removeItem.mutateAsync({ priceListId: row.price_list_id, itemId: row.item_id });
    }
    selection.clearSelection();
  }

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Base pricing context</h3>
            <p className="mt-1 text-base text-cream-700">Use these values as a baseline while editing price list overrides.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">MRP</p>
            <p className="mt-2 font-display text-xl leading-none text-cream-950">{pricingSummary.mrp != null ? formatNumberValue(pricingSummary.mrp, 'CURRENCY_EXACT') : '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Base selling price</p>
            <p className="mt-2 font-display text-xl leading-none text-cream-950">{pricingSummary.base_selling_price != null ? formatNumberValue(pricingSummary.base_selling_price, 'CURRENCY_EXACT') : '—'}</p>
          </div>
          {isAdmin ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Cost price</p>
                <p className="mt-2 font-display text-xl leading-none text-cream-950">{pricingSummary.cost_price != null ? formatNumberValue(pricingSummary.cost_price, 'CURRENCY_EXACT') : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Margin</p>
                <p className="mt-2 font-display text-xl leading-none text-cream-950">{pricingSummary.margin_pct != null ? `${pricingSummary.margin_pct}%` : '—'}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Pricing visibility</p>
                <p className="mt-2 font-display text-xl leading-none text-cream-950">Read only</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Override access</p>
                <p className="mt-2 font-display text-xl leading-none text-cream-950">Admin only</p>
              </div>
            </>
          )}
        </div>
      </article>

      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div>
          <h3 className="font-display text-lg text-cream-950">Pricelist membership</h3>
          <p className="mt-1 text-base text-cream-700">
            {memberCount} of {pricing.length} price lists include this product.
          </p>
        </div>
      </article>

      <div>
        {isAdmin ? (
          <MembershipBulkActionBar
            selectedCount={selection.selectedIds.length}
            onClear={selection.clearSelection}
            isPending={isPending}
            onInclude={() => void handleBulkInclude()}
            onRemove={() => void handleBulkRemove()}
          />
        ) : null}

        <FilterBar
          count={`${rows.length} price lists${isInterim ? ' · Updating' : ''}`}
          searchPlaceholder="Search price list…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          groups={filterGroups}
          searchValue={search}
          searchLoading={isInterim}
          onSearchChange={setSearch}
          sortOptions={[
            'Pricelist (A → Z)',
            'List price (high → low)',
            'Avg discount (high → low)',
            ...(isAdmin ? ['Avg margin (high → low)'] : []),
          ]}
          onSortChange={(value) => setSortBy(value as SortOption)}
        />

        <LandingTable
          columns={[
            ...(isAdmin
              ? [{ label: <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.someSelected} onChange={selection.toggleVisible} />, width: 48, className: 'px-5' }]
              : []),
            { label: 'Pricelist', width: 300, className: 'px-5' },
            { label: 'Member', width: 100, className: 'px-5' },
            { label: 'List price', width: 260, align: 'right' as const, className: 'px-5' },
            { label: 'Validity', width: 300, className: 'px-5' },
            { label: 'Status', width: 140, className: 'px-5' },
            { label: 'Avg discount', align: 'right' as const, minWidth: 140, className: 'px-5' },
            ...(isAdmin ? [{ label: 'Avg margin', align: 'right' as const, minWidth: 140, className: 'px-5' }] : []),
          ]}
          tableMinWidth={isAdmin ? 1180 : 1020}
          showEmptyState={rows.length === 0}
          emptyState={
            <div className="py-16 text-center text-sm text-cream-500">
              {pricing.length === 0 ? 'No price lists set up for this tenant yet.' : 'No price lists match these filters.'}
            </div>
          }
        >
          {rows.map((row) => {
            const isSelected = selection.selectedIds.includes(row.price_list_id);
            const isMember = Boolean(row.item_id);
            const canMutate = isAdmin && !row.is_managed_externally;
            const isEditing = editingPriceListId === row.price_list_id;
            const validity = `${formatDate(row.valid_from ?? row.created_at)} → ${row.valid_to ? formatDate(row.valid_to) : 'Open'}`;
            const isExpired = row.status === 'expired';

            return (
              <SelectableRow key={row.price_list_id} selected={isSelected}>
                {isAdmin ? (
                  <td className="px-3 py-2">
                    <RowSelectCheckbox
                      checked={isSelected}
                      onChange={() => selection.toggleRow(row.price_list_id)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={getInitials(row.price_list_name)} hue="teal" size={38} />
                    <div className="min-w-0">
                      <Link href={`/price-lists/${row.price_list_id}`} className="ent-name truncate font-medium text-cream-950 hover:text-ember-700">
                        {row.price_list_name}
                      </Link>
                      {row.is_managed_externally ? (
                        <p className="mt-0.5 truncate text-xs text-cream-600">Managed in Zoho</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <MemberToggle checked={isMember} label={`${row.price_list_name} membership`} />
                </td>
                <td className="group px-3 py-2 text-right font-mono font-semibold text-cream-950">
                  {isEditing ? (
                    <div className="flex justify-end gap-2">
                      <div className="inline-flex h-9 w-32 items-center rounded-[8px] border border-cream-300 bg-white px-2 focus-within:border-ember-400">
                        <span className="shrink-0 text-cream-600">₹</span>
                        <input
                          value={draftPrice}
                          onChange={(event) => setDraftPrice(formatNumberInput(event.target.value, 'CURRENCY_EXACT'))}
                          inputMode="decimal"
                          className="min-w-0 flex-1 bg-transparent text-right outline-none"
                          aria-label="List price"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={isPending} onClick={() => void saveEdit(row)} aria-label="Save list price">
                        <Save size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isPending}
                        onClick={() => {
                          setEditingPriceListId(null);
                          setDraftPrice('');
                        }}
                        aria-label="Cancel list price edit"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canMutate}
                      onClick={() => beginEdit(row)}
                      className={cn(
                        'inline-flex min-h-[1.5rem] items-center justify-end gap-2 rounded-[8px] text-right',
                        canMutate && 'hover:text-ember-700',
                      )}
                    >
                      {row.list_price != null ? (
                        formatNumberValue(row.list_price, 'CURRENCY_EXACT')
                      ) : (
                        <span className="text-sm font-normal text-cream-500">—</span>
                      )}
                      {canMutate ? <Pencil size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                    </button>
                  )}
                </td>
                <td className={cn('px-3 py-2 font-mono text-sm', isExpired ? 'text-cream-500 line-through' : 'text-cream-900')}>
                  {validity}
                </td>
                <td className="px-3 py-2">
                  <PriceListStatusBadge is_active={row.is_active} valid_from={row.valid_from} valid_to={row.valid_to} />
                </td>
                <td className="px-3 py-2 text-right">
                  {row.avg_discount_pct != null ? (
                    <span
                      className={cn(
                        'font-mono text-base font-semibold tabular-nums',
                        row.avg_discount_pct >= 0 ? 'text-teal-700' : 'text-danger-700',
                      )}
                    >
                      {row.avg_discount_pct >= 0 ? '-' : '+'}
                      {formatNumberValue(Math.abs(row.avg_discount_pct), 'PERCENTAGE')}
                    </span>
                  ) : (
                    <span className="text-cream-400">—</span>
                  )}
                </td>
                {isAdmin ? (
                  <td className="px-3 py-2 text-right">
                    {row.avg_margin_pct != null ? (
                      <span className="font-mono text-base font-semibold tabular-nums text-cream-900">
                        {formatNumberValue(row.avg_margin_pct, 'PERCENTAGE')}
                      </span>
                    ) : (
                      <span className="text-cream-400">—</span>
                    )}
                  </td>
                ) : null}
              </SelectableRow>
            );
          })}
        </LandingTable>
      </div>
    </section>
  );
}
'use client';

import { useState, useCallback } from 'react';
import { Plus, Package, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MutationButton } from '@/components/ui/mutation-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  useSearchMasterProducts,
  useAddProductToTenant,
} from '@/hooks/useProducts';
import { useRole } from '@/hooks/useRole';
import type { MasterProduct } from '@/hooks/useProducts';

function ProductThumbnail({ product }: { product: MasterProduct }) {
  const firstImage = product.image_urls?.[0];
  if (firstImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={firstImage}
        alt={product.name}
        className="w-12 h-12 rounded-md object-cover shrink-0"
      />
    );
  }
  return (
    <span className="w-12 h-12 rounded-md bg-cream-200 flex items-center justify-center shrink-0">
      <Package size={20} className="text-cream-500" />
    </span>
  );
}

interface ConfigFormProps {
  product: MasterProduct;
  onBack: () => void;
  onSuccess: () => void;
}

function ConfigForm({ product, onBack, onSuccess }: ConfigFormProps) {
  const { isSellerAdmin } = useRole();
  const addProduct = useAddProductToTenant();

  const [internalSku, setInternalSku] = useState(product.master_sku);
  const [mrp, setMrp] = useState('');
  const [baseSellingPrice, setBaseSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [skuError, setSkuError] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSkuError('');

      if (!internalSku.trim()) {
        setSkuError('Internal SKU is required.');
        return;
      }
      if (!mrp || !baseSellingPrice) return;

      try {
        await addProduct.mutateAsync({
          master_product_id: product.id,
          internal_sku: internalSku.trim(),
          mrp: parseFloat(mrp),
          base_selling_price: parseFloat(baseSellingPrice),
          ...(costPrice ? { cost_price: parseFloat(costPrice) } : {}),
        });
        onSuccess();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add product';
        if (msg.includes('SKU')) {
          setSkuError(msg);
        } else {
          toast.error(msg);
        }
      }
    },
    [addProduct, internalSku, mrp, baseSellingPrice, costPrice, product.id, onSuccess]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <SheetHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-cream-500 hover:text-cream-700 transition-colors"
            aria-label="Back to search"
          >
            <ArrowLeft size={18} />
          </button>
          <SheetTitle>Configure Product</SheetTitle>
        </div>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-5">
        {/* Master product preview */}
        <div className="bg-cream-100 border border-cream-200 rounded-md shadow-xs p-3 flex items-start gap-3">
          <ProductThumbnail product={product} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-cream-900 text-sm truncate">{product.name}</p>
            <p className="text-xs text-cream-600 truncate">{product.brand_name}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-cream-500 font-mono">{product.master_sku}</span>
              {product.gst_rate !== null && (
                <span className="text-xs text-cream-500">GST {product.gst_rate}%</span>
              )}
              {product.hsn_code && (
                <span className="text-xs text-cream-500">HSN {product.hsn_code}</span>
              )}
            </div>
          </div>
        </div>

        {/* Internal SKU */}
        <div className="space-y-1.5">
          <Label htmlFor="internal_sku">
            Internal SKU <span className="text-red-500">*</span>
          </Label>
          <Input
            id="internal_sku"
            value={internalSku}
            onChange={(e) => {
              setInternalSku(e.target.value);
              setSkuError('');
            }}
            placeholder="e.g. PROD-001"
            className={skuError ? 'border-red-400 focus-visible:ring-red-400' : ''}
          />
          {skuError && (
            <p className="text-xs text-red-600">{skuError}</p>
          )}
        </div>

        {/* MRP */}
        <div className="space-y-1.5">
          <Label htmlFor="mrp">
            MRP (₹) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="mrp"
            type="number"
            min="0"
            step="0.01"
            value={mrp}
            onChange={(e) => setMrp(e.target.value)}
            placeholder="0.00"
            className="font-mono"
            required
          />
        </div>

        {/* Base Selling Price */}
        <div className="space-y-1.5">
          <Label htmlFor="base_selling_price">
            Base Selling Price (₹) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="base_selling_price"
            type="number"
            min="0"
            step="0.01"
            value={baseSellingPrice}
            onChange={(e) => setBaseSellingPrice(e.target.value)}
            placeholder="0.00"
            className="font-mono"
            required
          />
        </div>

        {/* Cost Price — seller_admin only */}
        {isSellerAdmin && (
          <div className="space-y-1.5">
            <Label htmlFor="cost_price">Cost Price (₹)</Label>
            <Input
              id="cost_price"
              type="number"
              min="0"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00 (optional)"
              className="font-mono"
            />
          </div>
        )}
      </SheetBody>

      <SheetFooter>
        <MutationButton
          type="submit"
          isPending={addProduct.isPending}
          pendingLabel="Adding…"
          className="w-full bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add to catalog
        </MutationButton>
      </SheetFooter>
    </form>
  );
}

export function AddProductSheet() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<MasterProduct | null>(null);

  const { data: searchData, isLoading: isSearching } = useSearchMasterProducts(search);
  const results = searchData?.products ?? [];

  const handleSelect = useCallback((product: MasterProduct) => {
    setSelectedProduct(product);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setOpen(false);
    setSearch('');
    setSelectedProduct(null);
  }, []);

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) {
      setSearch('');
      setSelectedProduct(null);
    }
  }, []);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
      >
        <Plus size={16} />
        Add Product
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex flex-col p-0 max-w-sm">
          {selectedProduct ? (
            <ConfigForm
              product={selectedProduct}
              onBack={handleBack}
              onSuccess={handleSuccess}
            />
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Add Product from Catalog</SheetTitle>
              </SheetHeader>
              <div className="flex-1 flex flex-col overflow-hidden">
                <Command shouldFilter={false} className="border-none shadow-none flex-1 flex flex-col">
                  <div className="px-5 py-3 border-b border-cream-100">
                    <CommandInput
                      placeholder="Search by name, SKU, or brand…"
                      value={search}
                      onValueChange={setSearch}
                    />
                  </div>
                  <CommandList className="flex-1 overflow-y-auto">
                    {search.length === 0 && (
                      <div className="py-10 text-center text-sm text-cream-500">
                        Start typing to search the master catalog
                      </div>
                    )}
                    {search.length >= 1 && isSearching && (
                      <div className="py-10 text-center text-sm text-cream-500">
                        Searching…
                      </div>
                    )}
                    {search.length >= 1 && !isSearching && results.length === 0 && (
                      <CommandEmpty>No products found for &quot;{search}&quot;</CommandEmpty>
                    )}
                    {results.length > 0 && (
                      <CommandGroup heading="Master Catalog">
                        {results.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={() => handleSelect(product)}
                            className="flex items-center gap-3 py-2.5 cursor-pointer"
                          >
                            <ProductThumbnail product={product} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-cream-900 truncate">
                                {product.name}
                              </p>
                              <p className="text-xs text-cream-600 truncate">
                                {product.brand_name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-cream-500 font-mono">
                                  {product.master_sku}
                                </span>
                                {product.gst_rate !== null && (
                                  <span className="text-xs text-cream-400">
                                    GST {product.gst_rate}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-teal-600 font-medium shrink-0">
                              Add to catalog
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

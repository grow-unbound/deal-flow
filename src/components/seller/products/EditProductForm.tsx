'use client';

import { useRouter } from 'next/navigation';
import {
  useForm,
  useFieldArray,
  Controller,
  useWatch,
  useController,
  type SubmitHandler,
} from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X, AlertTriangle, Save, EyeOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ImageUploadZone } from './ImageUploadZone';

import { UNITS_OF_MEASURE } from '@/constants';
import { useRole } from '@/hooks/useRole';
import { useTenantBrands } from '@/hooks/useBrands';
import {
  useUpdateProduct,
  useDeactivateProduct,
  useReactivateProduct,
  type TenantProduct,
} from '@/hooks/useProducts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const GST_RATES = ['0', '5', '12', '18', '28'] as const;

const FormSchema = z.object({
  name_override: z.string().min(1, 'Product name is required'),
  tenant_brand_id: z.string().min(1, 'Brand is required'),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive'),
  cost_price: z.string().optional(),
  hsn_code: z.string().optional(),
  gst_rate: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.string().optional(),
  description: z.string().optional(),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  image_urls: z.array(z.string()).default([]),
});

type FormValues = z.infer<typeof FormSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function attributesObjToArray(
  obj: Record<string, string> | null | undefined,
): Array<{ key: string; value: string }> {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}

interface EditProductFormProps {
  product: TenantProduct & {
    hsn_code?: string | null;
    gst_rate?: number | null;
    description?: string | null;
    attributes_override?: Record<string, string> | null;
  };
}

export function EditProductForm({ product }: EditProductFormProps) {
  const router = useRouter();
  const { isSellerAdmin } = useRole();
  const { data: brandsData, isLoading: brandsLoading } = useTenantBrands();
  const updateProduct = useUpdateProduct();
  const deactivateProduct = useDeactivateProduct();
  const reactivateProduct = useReactivateProduct();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name_override: product.name_override ?? product.display_name ?? '',
      tenant_brand_id: product.tenant_brand_id ?? '',
      mrp: product.mrp ?? undefined,
      base_selling_price: product.base_selling_price ?? undefined,
      cost_price: product.cost_price != null ? String(product.cost_price) : '',
      hsn_code: product.hsn_code ?? '',
      gst_rate: product.gst_rate != null ? String(product.gst_rate) : '',
      default_uom: product.default_uom ?? '',
      pack_size: product.pack_size != null ? String(product.pack_size) : '',
      description: product.description ?? '',
      attributes: attributesObjToArray(product.attributes_override),
      image_urls: product.image_urls ?? [],
    },
  });

  const {
    fields: attrFields,
    append: appendAttr,
    remove: removeAttr,
  } = useFieldArray({ control, name: 'attributes' });

  const { field: imageUrlsField } = useController({ control, name: 'image_urls' });

  const watchedHsn = useWatch({ control, name: 'hsn_code' });
  const watchedGst = useWatch({ control, name: 'gst_rate' });
  const showHsnWarning = !watchedHsn || !watchedGst;

  const onSubmit: SubmitHandler<FormValues> = async (formData) => {
    const attributesObj: Record<string, string> = {};
    for (const attr of formData.attributes) {
      if (attr.key.trim()) {
        attributesObj[attr.key.trim()] = attr.value;
      }
    }

    const imageUrls = formData.image_urls.filter((u) => u.trim().length > 0);

    const costPrice =
      formData.cost_price && formData.cost_price !== ''
        ? Number(formData.cost_price)
        : null;
    const packSize =
      formData.pack_size && formData.pack_size !== ''
        ? Number(formData.pack_size)
        : null;
    const gstRate =
      formData.gst_rate && formData.gst_rate !== ''
        ? Number(formData.gst_rate)
        : null;

    try {
      await updateProduct.mutateAsync({
        id: product.id,
        data: {
          name_override: formData.name_override,
          tenant_brand_id: formData.tenant_brand_id || null,
          mrp: formData.mrp,
          base_selling_price: formData.base_selling_price,
          ...(isSellerAdmin ? { cost_price: costPrice } : {}),
          default_uom: formData.default_uom || null,
          pack_size: packSize,
          hsn_code: formData.hsn_code || null,
          gst_rate: gstRate,
          description: formData.description || null,
          attributes_override: attributesObj,
          image_urls: imageUrls,
        },
      });
      toast.success('Product updated');
      router.push('/products');
    } catch {
      toast.error('Failed to update product');
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateProduct.mutateAsync(product.id);
      toast.success('Product deactivated');
      router.push('/products');
    } catch {
      toast.error('Failed to deactivate product');
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivateProduct.mutateAsync(product.id);
      toast.success('Product reactivated');
    } catch {
      toast.error('Failed to reactivate product');
    }
  };

  const brands = brandsData?.brands ?? [];
  const isPending = isSubmitting || updateProduct.isPending;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-cream-100 rounded-lg p-6 shadow-sm"
      noValidate
    >
      {/* ── Section 1: Basic Info ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <Label htmlFor="name_override">Product name *</Label>
          <Input
            id="name_override"
            placeholder="e.g. Premium Red Wine 750ml"
            {...register('name_override')}
            className="mt-1"
          />
          <FieldError message={errors.name_override?.message} />
        </div>

        <div className="md:col-span-2">
          <Label>SKU (immutable)</Label>
          <p className="font-mono text-cream-900 bg-cream-200 px-3 py-2 rounded-md text-sm mt-1 select-all">
            {product.internal_sku}
          </p>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="tenant_brand_id">Brand *</Label>
          <Controller
            control={control}
            name="tenant_brand_id"
            render={({ field }) => (
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={brandsLoading}
              >
                <SelectTrigger id="tenant_brand_id" className="mt-1 w-full">
                  <SelectValue
                    placeholder={brandsLoading ? 'Loading brands…' : 'Select a brand'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.master_brand?.name ?? b.display_name_override ?? b.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.tenant_brand_id?.message} />
        </div>
      </div>

      <div className="border-t border-cream-200 my-4" />

      {/* ── Section 2: Pricing ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="mrp">MRP (₹) *</Label>
          <Input
            id="mrp"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register('mrp')}
            className="mt-1 font-mono"
          />
          <FieldError message={errors.mrp?.message} />
        </div>

        <div>
          <Label htmlFor="base_selling_price">Base selling price (₹) *</Label>
          <Input
            id="base_selling_price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register('base_selling_price')}
            className="mt-1 font-mono"
          />
          <FieldError message={errors.base_selling_price?.message} />
        </div>

        {isSellerAdmin && (
          <div>
            <Label htmlFor="cost_price">Cost price (₹)</Label>
            <Input
              id="cost_price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('cost_price')}
              className="mt-1 font-mono"
            />
            <FieldError message={errors.cost_price?.message} />
          </div>
        )}
      </div>

      <div className="border-t border-cream-200 my-4" />

      {/* ── Section 3: Product Details ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="hsn_code">HSN code</Label>
          <Input
            id="hsn_code"
            placeholder="e.g. 2204"
            {...register('hsn_code')}
            className="mt-1 font-mono"
          />
        </div>

        <div>
          <Label htmlFor="gst_rate">GST rate</Label>
          <Controller
            control={control}
            name="gst_rate"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <SelectTrigger id="gst_rate" className="mt-1 w-full">
                  <SelectValue placeholder="Select GST rate" />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {showHsnWarning && (
          <div className="md:col-span-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              HSN code and GST rate are required for Tally export.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="default_uom">Unit of measure</Label>
          <Controller
            control={control}
            name="default_uom"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <SelectTrigger id="default_uom" className="mt-1 w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNITS_OF_MEASURE.map((uom) => (
                    <SelectItem key={uom.value} value={uom.value}>
                      {uom.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="pack_size">Pack size</Label>
          <Input
            id="pack_size"
            type="number"
            step="1"
            min="1"
            placeholder="e.g. 12"
            {...register('pack_size')}
            className="mt-1 font-mono"
          />
          <FieldError message={errors.pack_size?.message} />
        </div>
      </div>

      <div className="border-t border-cream-200 my-4" />

      {/* ── Section 4: Description ── */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="Optional product description"
          {...register('description')}
          className="mt-1 w-full"
        />
      </div>

      <div className="border-t border-cream-200 my-4" />

      {/* ── Section 5: Attributes ── */}
      <div>
        <p className="text-sm font-medium text-cream-900 mb-3">Attributes</p>
        <div className="space-y-2">
          {attrFields.map((field, idx) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  placeholder="Key (e.g. colour)"
                  {...register(`attributes.${idx}.key`)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Value (e.g. red)"
                  {...register(`attributes.${idx}.value`)}
                  className="font-mono text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAttr(idx)}
                className="shrink-0 text-cream-500 hover:text-red-600"
                aria-label="Remove attribute"
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => appendAttr({ key: '', value: '' })}
          className="mt-2 gap-1 text-cream-700"
        >
          <Plus size={14} />
          Add attribute
        </Button>
      </div>

      <div className="border-t border-cream-200 my-4" />

      {/* ── Section 6: Product Images ── */}
      <div>
        <p className="text-sm font-medium text-cream-900 mb-3">Product Images</p>
        <ImageUploadZone
          value={imageUrlsField.value}
          onChange={imageUrlsField.onChange}
          maxImages={5}
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 pt-6 mt-2 border-t border-cream-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/products')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          className="gap-2 bg-teal-500 text-cream-50 hover:bg-teal-600"
        >
          <Save size={16} />
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* ── Danger Zone ── */}
      <div className="border-t border-cream-200 mt-6 pt-6">
        <p className="text-sm font-medium text-danger-700 mb-3">Danger zone</p>

        {product.is_active ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="gap-2 bg-danger-50 text-danger-700 border border-danger-200 hover:bg-danger-100"
                disabled={deactivateProduct.isPending}
              >
                <EyeOff size={16} />
                Deactivate product
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate product?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the product from future catalog publishing. Existing orders are
                  unaffected. You can reactivate it at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeactivate}
                  className="bg-danger-600 text-white hover:bg-danger-700"
                >
                  {deactivateProduct.isPending ? 'Deactivating…' : 'Deactivate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleReactivate}
            disabled={reactivateProduct.isPending}
          >
            <Eye size={16} />
            {reactivateProduct.isPending ? 'Reactivating…' : 'Reactivate product'}
          </Button>
        )}
      </div>
    </form>
  );
}

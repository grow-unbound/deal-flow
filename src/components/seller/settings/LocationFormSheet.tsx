'use client';

import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  DiscardChangesDialog,
  FormBlock,
  FormOverlay,
  FormOverlayBody,
  FormOverlayFooter,
  FormOverlayHeader,
  FormSectionGrid,
  useDirtyCloseGuard,
} from '@/components/ui/form-overlay';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { CreateLocationInputSchema, LocationTypeSchema, type TenantLocation } from '@/types/tenant-locations';

const FormSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(200),
  type: LocationTypeSchema,
  line1: z.string().max(500),
  line2: z.string().max(500).optional(),
  city: z.string().max(200),
  state: z.string().max(2),
  pincode: z.string().max(10),
  inventory_tracking: z.boolean(),
  is_default: z.boolean(),
  external_ref: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof FormSchema>;

function defaultsFromLocation(loc: TenantLocation | null): FormValues {
  if (!loc) {
    return {
      name: '',
      type: 'warehouse',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      inventory_tracking: true,
      is_default: false,
      external_ref: '',
    };
  }
  return {
    name: loc.name,
    type: loc.type,
    line1: loc.address?.line1 ?? '',
    line2: loc.address?.line2 ?? '',
    city: loc.address?.city ?? '',
    state: loc.address?.state ?? '',
    pincode: loc.address?.pincode ?? '',
    inventory_tracking: loc.inventory_tracking,
    is_default: loc.is_default,
    external_ref: loc.external_ref ?? '',
  };
}

interface LocationFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLocation: TenantLocation | null;
}

export function LocationFormSheet({ open, onOpenChange, editingLocation }: LocationFormSheetProps) {
  const { createLocation, updateLocation, isCreating, isUpdating } = useTenantLocations();

  const isEdit = Boolean(editingLocation?.id && !editingLocation.deleted_at);
  const pending = isCreating || isUpdating;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultsFromLocation(editingLocation),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultsFromLocation(editingLocation));
    }
  }, [open, editingLocation, form]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      form.reset(defaultsFromLocation(editingLocation));
      onOpenChange(false);
    },
  });

  const title = useMemo(() => (isEdit ? 'Edit location' : 'Add location'), [isEdit]);
  const description = useMemo(
    () =>
      isEdit
        ? "Update this location's details."
        : 'Add a warehouse, dispatch point, or branch. Inventory can be tracked per location.',
    [isEdit],
  );

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      type: values.type,
      address: {
        line1: values.line1.trim(),
        line2: (values.line2 ?? '').trim(),
        city: values.city.trim(),
        state: values.state.trim().toUpperCase().slice(0, 2),
        pincode: values.pincode.trim(),
      },
      inventory_tracking: values.inventory_tracking,
      is_default: values.is_default,
      external_ref: values.external_ref?.trim() ? values.external_ref.trim() : undefined,
    };

    const parsedCreate = CreateLocationInputSchema.safeParse(payload);
    if (!parsedCreate.success) {
      form.setError('root', { message: parsedCreate.error.issues[0]?.message ?? 'Invalid' });
      return;
    }

    if (isEdit && editingLocation) {
      await updateLocation({
        id: editingLocation.id,
        patch: {
          name: parsedCreate.data.name,
          type: parsedCreate.data.type,
          address: parsedCreate.data.address,
          inventory_tracking: parsedCreate.data.inventory_tracking,
          is_default: parsedCreate.data.is_default,
          external_ref: parsedCreate.data.external_ref ?? null,
        },
      });
    } else {
      await createLocation(parsedCreate.data);
    }
    form.reset(values);
    onOpenChange(false);
  }

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader title={title} description={description} eyebrow="Settings" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="flex-1 space-y-5 overflow-y-auto">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Mumbai Warehouse" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="warehouse">Warehouse — holds stock</SelectItem>
                        <SelectItem value="dispatch_point">Dispatch point — ships orders</SelectItem>
                        <SelectItem value="branch">Branch — sales or admin office</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormBlock title="Address">
                <FormSectionGrid>
                  <FormField
                    control={form.control}
                    name="line1"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Street / line 1</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Building, street" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="line2"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Line 2 (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Floor, unit" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State (2 letters)</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={2} className="uppercase" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PIN code</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>
              </FormBlock>

              <FormField
                control={form.control}
                name="external_ref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External reference (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ERP / Tally code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inventory_tracking"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-cream-200 p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Track inventory at this location</FormLabel>
                      <p className="text-body-sm text-cream-600">Stock levels are maintained per SKU for tracked locations.</p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-cream-200 p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Default location</FormLabel>
                      <p className="text-body-sm text-cream-600">Used as the preferred location for new inventory rows where applicable.</p>
                    </div>
                  </FormItem>
                )}
              />

              {form.formState.errors.root ? (
                <p className="text-body-sm text-danger-600">{form.formState.errors.root.message}</p>
              ) : null}
            </FormOverlayBody>

            <FormOverlayFooter className="justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>
                Cancel
              </Button>
              <MutationButton type="submit" isPending={pending} pendingLabel="Saving…">
                {isEdit ? 'Save changes' : 'Add location'}
              </MutationButton>
            </FormOverlayFooter>
          </form>
        </Form>
      </FormOverlay>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
    </>
  );
}

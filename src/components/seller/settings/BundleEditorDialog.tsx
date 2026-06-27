'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export interface BundleSlot {
  id?: string;
  tenant_category_id: string;
  category_name?: string | null;
  slot_label: string;
  is_required: boolean;
  display_order: number;
}

export interface BundleRecord {
  id: string;
  name: string;
  description: string | null;
  source?: string | null;
  slots: BundleSlot[];
}

interface BundleEditorDialogProps {
  open: boolean;
  onClose: () => void;
  bundle?: BundleRecord | null;
  availableCategories: { id: string; name: string }[];
  onSaved: (bundleId: string, name: string) => void;
}

export function BundleEditorDialog({
  open,
  onClose,
  bundle,
  availableCategories,
  onSaved,
}: BundleEditorDialogProps) {
  const isEdit = Boolean(bundle);
  const [name, setName] = useState(bundle?.name ?? '');
  const [description, setDescription] = useState(bundle?.description ?? '');
  const [slots, setSlots] = useState<Omit<BundleSlot, 'id'>[]>(
    (bundle?.slots ?? []).map((s) => ({
      tenant_category_id: s.tenant_category_id,
      category_name: s.category_name,
      slot_label: s.slot_label,
      is_required: s.is_required,
      display_order: s.display_order,
    })),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(bundle?.name ?? '');
      setDescription(bundle?.description ?? '');
      setSlots(
        (bundle?.slots ?? []).map((s) => ({
          tenant_category_id: s.tenant_category_id,
          category_name: s.category_name,
          slot_label: s.slot_label,
          is_required: s.is_required,
          display_order: s.display_order,
        })),
      );
    }
  }, [open, bundle]);

  const usedCategoryIds = new Set(slots.map((s) => s.tenant_category_id));
  const unusedCategories = availableCategories.filter((c) => !usedCategoryIds.has(c.id));

  function addSlot(categoryId: string) {
    const cat = availableCategories.find((c) => c.id === categoryId);
    if (!cat) return;
    setSlots((prev) => [
      ...prev,
      {
        tenant_category_id: categoryId,
        category_name: cat.name,
        slot_label: '',
        is_required: true,
        display_order: prev.length,
      },
    ]);
  }

  function removeSlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, display_order: i })));
  }

  function updateSlot(idx: number, field: keyof BundleSlot, value: string | boolean) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Bundle name is required'); return; }
    if (slots.length === 0) { toast.error('Add at least one slot category'); return; }

    setSaving(true);
    try {
      if (isEdit && bundle) {
        const res = await fetch(`/api/tenant/reco/bundles/${bundle.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update bundle');
        // Sync slots via bulk replace (delete all + re-insert)
        // Simple approach: delete all existing slots then re-insert
        const slotsRes = await fetch(`/api/tenant/reco/bundles/${bundle.id}/slots`);
        const { slots: existingSlots } = await slotsRes.json();
        for (const s of existingSlots) {
          await fetch(`/api/tenant/reco/bundles/${bundle.id}/slots?slot_id=${s.id}`, { method: 'DELETE' });
        }
        for (const s of slots) {
          await fetch(`/api/tenant/reco/bundles/${bundle.id}/slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant_category_id: s.tenant_category_id,
              slot_label: s.slot_label || null,
              is_required: s.is_required,
              display_order: s.display_order,
            }),
          });
        }
        toast.success('Bundle updated');
        onSaved(bundle.id, name.trim());
      } else {
        const res = await fetch('/api/tenant/reco/bundles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            slots: slots.map((s) => ({
              tenant_category_id: s.tenant_category_id,
              slot_label: s.slot_label || null,
              is_required: s.is_required,
              display_order: s.display_order,
            })),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to create bundle');
        toast.success('Bundle created');
        onSaved(json.bundle_id, name.trim());
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save bundle');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Bundle' : 'Create Bundle'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cream-700">Bundle name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4-Camera CCTV Kit"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-cream-700">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bundle include?"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-cream-700">Slots ({slots.length})</label>
              {unusedCategories.length > 0 && (
                <select
                  onChange={(e) => { if (e.target.value) { addSlot(e.target.value); e.target.value = ''; } }}
                  className="rounded-md border border-cream-200 bg-white px-2.5 py-1 text-xs text-cream-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">+ Add category slot</option>
                  {unusedCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {slots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-cream-300 py-6 text-center text-sm text-cream-400">
                No slots yet. Add a category above.
              </p>
            ) : (
              <div className="space-y-2">
                {slots.map((slot, idx) => (
                  <div key={slot.tenant_category_id} className="flex items-center gap-2 rounded-lg border border-cream-200 bg-cream-50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cream-900">{slot.category_name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          value={slot.slot_label}
                          onChange={(e) => updateSlot(idx, 'slot_label', e.target.value)}
                          placeholder="Label (e.g. Recorder)"
                          className="h-7 text-xs"
                        />
                        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-cream-600">
                          <input
                            type="checkbox"
                            checked={slot.is_required}
                            onChange={(e) => updateSlot(idx, 'is_required', e.target.checked)}
                            className="accent-teal-500"
                          />
                          Required
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSlot(idx)}
                      className="shrink-0 p-1 text-cream-400 hover:text-red-500 transition-colors"
                      aria-label="Remove slot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create bundle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

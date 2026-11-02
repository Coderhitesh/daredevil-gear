'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, SlidersHorizontal, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { inr, toPaise, toRupees } from '@/lib/format';
import { Modal, Input, Checkbox, Spinner, Status, Pill } from '@/components/ui';
import AdjustStock from '@/components/inventory/AdjustStock';

export default function VariantsPanel({ product }) {
  const can = useCan();
  const [adjust, setAdjust] = useState(null);
  const [edit, setEdit] = useState(null); // variant or {} for new
  const variants = product.variants || [];
  const key = ['product', product._id];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-graphite-600">
          Stock is tracked per option. <strong>Available</strong> = on hand minus units held for unpaid orders.
        </p>
        <div className="flex gap-2">
          <Link href={`/inventory/movements?product=${product._id}`} className="btn-ghost">
            Stock history
          </Link>
          {can('products:write') ? (
            <button type="button" className="btn-outline" onClick={() => setEdit({})}>
              <Plus className="h-4 w-4" /> Add option
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-stone-300">
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Option</th>
              <th className="text-right">Price</th>
              <th className="text-right">On hand</th>
              <th className="text-right">Reserved</th>
              <th className="text-right">Available</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v._id}>
                <td className="font-mono text-xs">
                  {v.sku}
                  {v.isDefault ? <span className="ml-1 text-graphite-400">(default)</span> : null}
                </td>
                <td>{v.title}</td>
                <td className="text-right tabular">{v.priceInclusive ? inr(v.priceInclusive) : <span className="text-graphite-400">Product price</span>}</td>
                <td className="text-right tabular">{v.trackInventory === false ? '—' : v.stock}</td>
                <td className="text-right tabular">{v.reserved || 0}</td>
                <td className="text-right tabular">{v.trackInventory === false ? <Pill>Not tracked</Pill> : v.available <= (v.lowStockThreshold ?? 5) ? <span className={v.available ? 'text-caution' : 'text-alert'}>{v.available}</span> : v.available}</td>
                <td>
                  <Status value={v.isActive ? 'active' : 'archived'} label={v.isActive ? 'Active' : 'Hidden'} />
                </td>
                <td className="whitespace-nowrap text-right">
                  {can('inventory:write') ? (
                    <button type="button" className="btn-ghost btn-xs" onClick={() => setAdjust(v)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Stock
                    </button>
                  ) : null}
                  {can('products:write') ? (
                    <button type="button" className="btn-ghost btn-xs" onClick={() => setEdit(v)} aria-label={`Edit ${v.sku}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adjust ? <AdjustStock variant={adjust} onClose={() => setAdjust(null)} invalidate={[key]} /> : null}
      {edit ? <VariantForm product={product} variant={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function VariantForm({ product, variant, onClose }) {
  const isNew = !variant._id;
  const [v, setV] = useState({
    title: variant.title || '',
    sku: '',
    price: toRupees(variant.priceInclusive),
    weightKg: variant.weightKg ?? '',
    lowStockThreshold: variant.lowStockThreshold ?? 5,
    isActive: variant.isActive ?? true,
    trackInventory: variant.trackInventory ?? true,
    initialStock: '',
  });
  const up = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = useAction(
    () => {
      const price = v.price === '' ? null : toPaise(v.price);
      if (isNew) {
        return api(`/products/${product._id}/variants`, {
          method: 'POST',
          body: { title: v.title.trim(), sku: v.sku.trim() || undefined, priceInclusive: price ?? undefined, weightKg: v.weightKg === '' ? undefined : Number(v.weightKg), initialStock: v.initialStock === '' ? undefined : Number(v.initialStock) },
        });
      }
      return api(`/products/${product._id}/variants/${variant._id}`, {
        method: 'PATCH',
        body: { title: v.title.trim(), priceInclusive: price, weightKg: v.weightKg === '' ? undefined : Number(v.weightKg), lowStockThreshold: Number(v.lowStockThreshold), isActive: v.isActive, trackInventory: v.trackInventory },
      });
    },
    { invalidate: [['product', product._id], '/inventory'], success: isNew ? 'Option added' : 'Option saved', onSuccess: onClose }
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add option' : `Edit ${variant.sku}`}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!v.title.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner /> : null} {isNew ? 'Add option' : 'Save'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Option name" required value={v.title} onChange={up('title')} placeholder="Size L / Olive" />
        {isNew ? <Input label="SKU" value={v.sku} onChange={up('sku')} hint={`Leave blank for ${product.sku}-NN`} /> : null}
        <Input label="Price override (incl. GST)" inputMode="decimal" value={v.price} onChange={up('price')} hint="Blank uses the product price" />
        <Input label="Weight (kg)" type="number" step="0.01" value={v.weightKg} onChange={up('weightKg')} />
        {isNew ? (
          <Input label="Opening stock" type="number" step={1} min={0} value={v.initialStock} onChange={up('initialStock')} />
        ) : (
          <Input label="Low-stock alert at" type="number" step={1} min={0} value={v.lowStockThreshold} onChange={up('lowStockThreshold')} />
        )}
        {!isNew ? (
          <div className="space-y-2 sm:col-span-2">
            <Checkbox label="Active (customers can choose it)" checked={v.isActive} onChange={up('isActive')} />
            <Checkbox label="Track stock for this option" checked={v.trackInventory} onChange={up('trackInventory')} hint="Turn off only for made-to-order items" />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

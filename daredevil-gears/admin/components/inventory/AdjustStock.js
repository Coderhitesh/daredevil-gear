'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Modal, Input, Select, Textarea, Spinner } from '@/components/ui';

/** Stock adjustment dialog for one variant. Every change is written to the inventory ledger. */
export default function AdjustStock({ variant, onClose, invalidate = [] }) {
  const [mode, setMode] = useState('delta');
  const [qty, setQty] = useState('');
  const [type, setType] = useState('adjustment');
  const [reason, setReason] = useState('');
  const n = Number(qty);
  const valid = qty !== '' && Number.isInteger(n) && (mode === 'set' ? n >= 0 : n !== 0) && reason.trim().length >= 3;
  const next = mode === 'set' ? n : (variant.stock || 0) + (Number.isFinite(n) ? n : 0);

  const save = useAction(() => api(`/inventory/${variant._id}/adjust`, { method: 'POST', body: { mode, quantity: n, reason: reason.trim(), type } }), {
    invalidate: ['/inventory', '/inventory/movements', ...invalidate],
    success: (v) => `${v.sku}: stock is now ${v.stock}`,
    onSuccess: onClose,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust stock: ${variant.sku}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-dark" disabled={!valid || save.isPending || next < (variant.reserved || 0)} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner /> : null} Save adjustment
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-2 rounded bg-stone-200 p-3 text-center text-sm">
          <div>
            <dt className="text-xs text-graphite-400">On hand</dt>
            <dd className="font-semibold tabular">{variant.stock}</dd>
          </div>
          <div>
            <dt className="text-xs text-graphite-400">Reserved</dt>
            <dd className="font-semibold tabular">{variant.reserved}</dd>
          </div>
          <div>
            <dt className="text-xs text-graphite-400">Available</dt>
            <dd className="font-semibold tabular">{variant.available}</dd>
          </div>
        </dl>
        <Select label="Change" value={mode} onChange={(e) => setMode(e.target.value)} options={[['delta', 'Add or remove units'], ['set', 'Set the on-hand count (stock take)']]} />
        <Input label={mode === 'set' ? 'Counted on hand' : 'Units (+ to add, − to remove)'} type="number" step={1} value={qty} onChange={(e) => setQty(e.target.value)} required hint={qty !== '' ? `On hand will become ${next}` : undefined} error={next < (variant.reserved || 0) ? `Cannot go below the ${variant.reserved} units reserved by unpaid orders` : undefined} />
        {mode === 'delta' ? <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={[['adjustment', 'Adjustment (new stock, found units)'], ['damaged', 'Damaged / written off'], ['correction', 'Correction']]} /> : null}
        <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the stock ledger, e.g. “Received PO-114 from supplier”." />
      </div>
    </Modal>
  );
}

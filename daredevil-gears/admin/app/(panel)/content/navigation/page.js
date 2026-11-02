'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { PageHeader, Card, Notice, Spinner, Tabs } from '@/components/ui';
import Guard from '@/components/shell/Guard';

const MENUS = [
  ['footer_help', 'Footer: Help'],
  ['footer_company', 'Footer: Company'],
  ['footer_legal', 'Footer: Legal strip'],
];

export default function NavigationPage() {
  const { data: menus = [], isLoading } = useQuery({ queryKey: ['/navigation'], queryFn: () => api('/navigation') });
  const [key, setKey] = useState('footer_help');
  const menu = menus.find((m) => m.key === key);

  return (
    <Guard perm="content:write">
      <PageHeader title="Menus" description="Footer link lists. The main header menu is built from active categories that have published products, so there is only one menu to maintain." />
      <Tabs value={key} onChange={setKey} tabs={MENUS} />
      {isLoading ? <div className="skeleton h-40" /> : <MenuEditor key={key + (menu?.updatedAt || '')} menuKey={key} initial={menu?.items || []} />}
    </Guard>
  );
}

function MenuEditor({ menuKey, initial }) {
  const [items, setItems] = useState(initial.map(({ label, href }) => ({ label, href })));
  const [errors, setErrors] = useState({});
  useEffect(() => setErrors({}), [items]);
  const save = useAction(() => api(`/navigation/${menuKey}`, { method: 'PUT', body: { items: items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), href: i.href.trim() })) } }), {
    invalidate: ['/navigation'],
    success: 'Menu saved. The storefront updates within a few minutes.',
    onError: (err) => {
      const map = fieldErrors(err);
      if (Object.keys(map).length) {
        setErrors(map);
        return false;
      }
      return false;
    },
  });
  const set = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  return (
    <Card
      actions={
        <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null} Save menu
        </button>
      }
      title="Links"
    >
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <input className="input" placeholder="Label" aria-label={`Link ${i + 1} label`} value={it.label} onChange={(e) => set(i, 'label', e.target.value)} />
            <div>
              <input className="input" placeholder="/pages/faq" aria-label={`Link ${i + 1} address`} value={it.href} onChange={(e) => set(i, 'href', e.target.value)} aria-invalid={errors[`items.${i}.href`] ? true : undefined} />
              {errors[`items.${i}.href`] ? <p className="error">{errors[`items.${i}.href`]}</p> : null}
            </div>
            <span className="flex gap-1">
              <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove link">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="btn-outline btn-xs" onClick={() => setItems([...items, { label: '', href: '' }])} disabled={items.length >= 20}>
          <Plus className="h-3.5 w-3.5" /> Add link
        </button>
      </div>
      {menuKey === 'footer_legal' ? (
        <div className="mt-4">
          <Notice tone="info">Keep links to Terms, Privacy, Shipping, Returns and Grievance redressal reachable from every page.</Notice>
        </div>
      ) : null}
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { ArrowUp, ArrowDown, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { humanize, storefrontUrl } from '@/lib/format';
import { PageHeader, Card, Drawer, Spinner, Pill, Notice } from '@/components/ui';
import { FieldSet, toBody, toFormValues } from '@/components/form/fields';
import Guard from '@/components/shell/Guard';

const TYPE_LABEL = {
  hero: 'Hero banners',
  offers: 'Offer posts',
  combos: 'Combo offers',
  trust: 'Trust strip',
  featured_categories: 'Category tiles',
  product_rail: 'Product rail',
  collection_rail: 'Collection rail',
  story: 'Brand story',
  promo_banners: 'Promo banners',
  recently_viewed: 'Recently viewed',
  reviews: 'Customer reviews',
  bulk_orders: 'Bulk orders band',
  newsletter: 'Newsletter sign-up',
};

const NOTE = {
  hero: 'Shows the active hero banners. Edit them under Banners.',
  promo_banners: 'Shows active promo banners. Edit them under Banners.',
  offers: 'Shows offer posts. Add them under Banners → placement "Homepage offer post". Hidden while there are none.',
  combos: 'Shows live combo and multi-buy offers from Combo offers. Hidden while there are none.',
  recently_viewed: 'Shown only to visitors who have viewed products.',
  reviews: 'Shows approved, verified reviews only. Hidden while there are none.',
};

export default function HomeSectionsPage() {
  const { data: sections = [], isLoading } = useQuery({ queryKey: ['/home-sections'], queryFn: () => api('/home-sections') });
  const [edit, setEdit] = useState(null);
  const reorder = useAction((ids) => api('/home-sections/reorder', { method: 'POST', body: { ids } }), { invalidate: ['/home-sections'], success: 'Order saved' });
  const toggle = useAction((s) => api(`/home-sections/${s._id}`, { method: 'PATCH', body: { isVisible: !s.isVisible } }), { invalidate: ['/home-sections'], success: (s) => (s.isVisible ? 'Section shown' : 'Section hidden') });

  const move = (i, d) => {
    const ids = sections.map((s) => s._id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <Guard perm="content:write">
      <PageHeader
        title="Homepage"
        description="Sections appear in this order. Empty sections (for example a collection with no published products) are skipped automatically."
        actions={
          <a href={storefrontUrl('/')} target="_blank" rel="noreferrer" className="btn-outline">
            Preview homepage
          </a>
        }
      />
      <Card bodyClass="">
        {isLoading ? (
          <div className="skeleton m-4 h-40" />
        ) : (
          <ol className="divide-y divide-stone-200">
            {sections.map((s, i) => (
              <li key={s._id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${s.isVisible ? '' : 'bg-paper text-graphite-400'}`}>
                <span className="w-6 text-sm tabular text-graphite-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.title || TYPE_LABEL[s.type]}</span>
                  {s.title ? (
                    <span className="ml-2">
                      <Pill>{TYPE_LABEL[s.type] || humanize(s.type)}</Pill>
                    </span>
                  ) : null}
                  {s.config?.source && ['product_rail'].includes(s.type) ? <span className="ml-2 text-xs text-graphite-400">{humanize(s.config.source)}</span> : null}
                  {NOTE[s.type] ? <span className="block text-xs text-graphite-400">{NOTE[s.type]}</span> : null}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, 1)} disabled={i === sections.length - 1 || reorder.isPending} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => toggle.mutate(s)} aria-label={s.isVisible ? 'Hide section' : 'Show section'}>
                    {s.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button type="button" className="btn-outline btn-xs" onClick={() => setEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {edit ? <SectionDrawer section={edit} onClose={() => setEdit(null)} /> : null}
    </Guard>
  );
}

function SectionDrawer({ section, onClose }) {
  const { data: collections = [] } = useQuery({ queryKey: ['/collections', 'all'], queryFn: () => api('/collections', { query: { limit: 200 } }).then((r) => r.data) });
  const { data: categories = [] } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });
  const t = section.type;
  const fields = [
    { name: 'title', label: 'Heading', span: 2 },
    { name: 'subtitle', label: 'Supporting line', span: 2 },
    ...(t === 'product_rail'
      ? [
          { name: 'config.source', label: 'Products to show', type: 'select', required: true, options: [['bestsellers', 'Bestsellers (by units sold)'], ['new', 'Newest'], ['featured', 'Featured products'], ['manual', 'Hand-picked'], ['category', 'From a category']] },
          { name: 'config.limit', label: 'How many', type: 'number', step: 1, min: 1, max: 24 },
          { name: 'config.category', label: 'Category', type: 'select', nullable: true, options: categories.map((c) => [String(c._id), c.name]), show: (v) => v.config?.source === 'category' },
          { name: 'config.products', label: 'Products', type: 'products', max: 24, show: (v) => v.config?.source === 'manual' },
        ]
      : []),
    ...(t === 'collection_rail'
      ? [
          { name: 'config.collection', label: 'Collection', type: 'select', nullable: true, options: collections.map((c) => [String(c._id), c.name]), hint: 'Leave empty to match the collection whose name equals the heading' },
          { name: 'config.limit', label: 'How many', type: 'number', step: 1, min: 1, max: 24 },
        ]
      : []),
    ...(t === 'featured_categories' ? [{ name: 'config.categories', label: 'Categories (leave all unticked to show every category with products)', type: 'multiselect', options: categories.map((c) => [String(c._id), c.name]) }] : []),
    ...(['story', 'bulk_orders'].includes(t)
      ? [
          { name: 'config.body', label: 'Text', type: 'textarea', rows: 5 },
          ...(t === 'story' ? [{ name: 'config.image', label: 'Image', type: 'imageurl', folder: 'home' }, { name: 'config.imageAlt', label: 'Image description', span: 2 }] : []),
        ]
      : []),
    ...(['product_rail', 'collection_rail', 'story', 'bulk_orders'].includes(t)
      ? [
          { name: 'config.ctaLabel', label: 'Link label' },
          { name: 'config.ctaHref', label: 'Link', placeholder: '/shop' },
        ]
      : []),
    { name: 'isVisible', label: 'Show this section', type: 'checkbox' },
  ];
  const form = useForm({ defaultValues: { ...toFormValues(fields, section), items: section.config?.items || [] } });
  const save = useAction(
    (v) => {
      const body = toBody(fields, v);
      if (t === 'trust') body.config = { ...(body.config || {}), items: (v.items || []).filter((x) => x.title?.trim()).map((x) => ({ title: x.title.trim(), text: x.text?.trim() || undefined, icon: x.icon || undefined })) };
      return api(`/home-sections/${section._id}`, { method: 'PATCH', body });
    },
    { invalidate: ['/home-sections'], success: 'Section saved', onSuccess: onClose }
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit: ${TYPE_LABEL[t] || humanize(t)}`}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="section-form" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null} Save section
          </button>
        </>
      }
    >
      <form id="section-form" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5">
        {NOTE[t] ? <Notice tone="info">{NOTE[t]}</Notice> : null}
        <FieldSet fields={fields} form={form} />
        {t === 'trust' ? <TrustItems form={form} /> : null}
      </form>
    </Drawer>
  );
}

function TrustItems({ form }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">Trust points</p>
        <button type="button" className="btn-ghost btn-xs" onClick={() => append({ title: '', text: '', icon: '' })} disabled={fields.length >= 8}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <p className="hint mb-2">Only promises you keep: real delivery times, the actual return window, payment security.</p>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.id} className="grid gap-2 rounded border border-stone-400 p-2 sm:grid-cols-[1fr_2fr_7rem_auto]">
            <input className="input" placeholder="Title" aria-label="Title" {...form.register(`items.${i}.title`)} />
            <input className="input" placeholder="Short text" aria-label="Text" {...form.register(`items.${i}.text`)} />
            <select className="input" aria-label="Icon" {...form.register(`items.${i}.icon`)}>
              <option value="">Icon</option>
              {['truck', 'shield', 'rotate', 'receipt'].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

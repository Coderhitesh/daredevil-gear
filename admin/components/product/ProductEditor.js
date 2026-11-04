'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { api, applyFieldErrors } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { inr, toPaise, storefrontUrl } from '@/lib/format';
import { PageHeader, Tabs, Spinner, Notice, Input, Status } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { FieldSet, toBody, toFormValues } from '@/components/form/fields';
import Guard from '@/components/shell/Guard';
import { detailsFields, pricingFields, complianceFields, seoFields } from './fieldsets';
import SpecsEditor from './SpecsEditor';
import CertificatesEditor from './CertificatesEditor';
import StatusPanel from './StatusPanel';
import ImagesPanel from './ImagesPanel';
import VariantsPanel from './VariantsPanel';

const SPEC_FIELD = { name: 'specifications', type: 'custom', submit: true, render: ({ form }) => <SpecsEditor form={form} /> };
const CERT_FIELD = { name: 'compliance.certificates', type: 'custom', submit: true, render: ({ form }) => <CertificatesEditor form={form} /> };

export default function ProductEditor({ id }) {
  const isNew = !id;
  const { data: product, isLoading, error } = useQuery({ queryKey: ['product', id], queryFn: () => api(`/products/${id}`), enabled: !isNew });
  const { data: categories } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });
  const { data: brands } = useQuery({ queryKey: ['/brands', 'all'], queryFn: () => api('/brands', { query: { limit: 200 } }).then((r) => r.data) });

  if (!isNew && (isLoading || !product)) {
    return <div className="flex justify-center py-20">{error ? <p className="text-alert">{error.message}</p> : <Spinner className="h-6 w-6" />}</div>;
  }
  if (!categories || !brands) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  return (
    <Guard perm="products:read">
      <EditorBody key={product?.updatedAt || 'new'} product={product} categories={categories} brands={brands} />
    </Guard>
  );
}

function EditorBody({ product, categories, brands }) {
  const isNew = !product;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const can = useCan();
  const writable = can('products:write');
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);

  const groups = useMemo(
    () => ({
      details: [...detailsFields({ categories, brands }), SPEC_FIELD],
      pricing: pricingFields(),
      compliance: [...complianceFields(), CERT_FIELD],
      seo: seoFields(),
    }),
    [categories, brands]
  );
  const all = useMemo(() => Object.values(groups).flat(), [groups]);
  const defaults = { pricing: { gstRule: 'fixed', gstRate: 18, sale: { active: false } }, compliance: { countryOfOrigin: 'India', returnable: true, returnWindowDays: 7, minAge: 0 }, specifications: [] };
  const form = useForm({ defaultValues: { ...toFormValues(all, product || {}, isNew ? defaults : {}), specifications: product?.specifications || [], compliance: { ...toFormValues(all, product || {}, isNew ? defaults : {}).compliance, certificates: product?.compliance?.certificates || [] }, initialStock: '' } });
  const values = form.watch();

  async function save(v) {
    setSaving(true);
    try {
      let body = toBody(all, v);
      body.specifications = (body.specifications || []).filter((s) => s.label?.trim() && s.value?.trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim(), isPublic: Boolean(s.isPublic) }));
      if (body.compliance?.certificates) body.compliance.certificates = body.compliance.certificates.filter((c) => c.name?.trim()).map((c) => ({ ...c, fileUrl: c.fileUrl || undefined, verified: Boolean(c.verified) }));
      if (body.pricing?.sale && !body.pricing.sale.active) body.pricing.sale = { active: false };
      if (isNew) {
        if (v.initialStock !== '') body.initialStock = Number(v.initialStock);
        const res = await api('/products', { method: 'POST', body });
        toast.show(res.warning || 'Product created as a draft');
        router.replace(`/products/${res.product._id}`);
        return;
      }
      // send only the top-level groups that changed so untouched fields keep following future imports
      const dirty = form.formState.dirtyFields;
      const patch = Object.fromEntries(Object.entries(body).filter(([k]) => dirty[k] !== undefined));
      if (!Object.keys(patch).length) {
        toast.show('No changes to save');
        return;
      }
      const updated = await api(`/products/${product._id}`, { method: 'PATCH', body: patch });
      qc.setQueryData(['product', product._id], updated);
      qc.invalidateQueries({ queryKey: ['/products'] });
      qc.invalidateQueries({ queryKey: ['products-summary'] });
      toast.show(updated.flags?.some((f) => !f.resolvedAt && f.severity === 'blocking') ? 'Saved. Compliance checks found blocking issues — see the panel on the right.' : 'Changes saved');
    } catch (err) {
      if (applyFieldErrors(err, form.setError)) toast.show('Please check the highlighted fields', 'error');
      else toast.show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const tabErrors = (key) => {
    const errs = form.formState.errors;
    return groups[key].some((f) => f.name.split('.').reduce((o, k) => o?.[k], errs)) ? '!' : null;
  };

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <PageHeader
        back={
          <Link href="/products" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-400 hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Products
          </Link>
        }
        title={isNew ? 'New product' : product.name}
        description={isNew ? 'New products start as drafts. Publish once the checks on the right are clear.' : <span className="flex flex-wrap items-center gap-2">SKU {product.sku} <Status value={product.status} /></span>}
        actions={
          <>
            {!isNew && product.status === 'published' ? (
              <a href={storefrontUrl(`/product/${product.slug}`)} target="_blank" rel="noreferrer" className="btn-outline">
                <ExternalLink className="h-4 w-4" /> View on store
              </a>
            ) : null}
            {writable ? (
              <button type="submit" className="btn-primary" disabled={saving || (!isNew && !form.formState.isDirty)}>
                {saving ? <Spinner /> : null}
                {isNew ? 'Create draft' : 'Save changes'}
              </button>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              ['details', 'Details', tabErrors('details')],
              ['pricing', 'Pricing & GST', tabErrors('pricing')],
              ['compliance', 'Compliance', tabErrors('compliance') || (product?.statutoryMissing?.length ? product.statutoryMissing.length : null)],
              ['seo', 'Search'],
              ...(isNew ? [] : [['media', 'Photos'], ['stock', 'Options & stock']]),
            ]}
          />
          <fieldset disabled={!writable} className="card card-body min-w-0">
            {tab === 'details' ? <FieldSet fields={groups.details} form={form} /> : null}
            {tab === 'pricing' ? (
              <>
                <TaxPreview values={values} />
                <FieldSet fields={groups.pricing} form={form} />
              </>
            ) : null}
            {tab === 'compliance' ? (
              <>
                {product?.statutoryMissing?.length ? (
                  <div className="mb-4">
                    <Notice tone="caution" title="Missing declarations">
                      {product.statutoryMissing.join(', ')}. Packaged goods sold online must show these on the product page.
                    </Notice>
                  </div>
                ) : null}
                <FieldSet fields={groups.compliance} form={form} />
              </>
            ) : null}
            {tab === 'seo' ? <FieldSet fields={groups.seo} form={form} /> : null}
            {tab === 'media' && product ? <ImagesPanel product={product} /> : null}
            {tab === 'stock' && product ? <VariantsPanel product={product} /> : null}
            {isNew && tab === 'details' ? (
              <div className="mt-4 max-w-xs">
                <Input type="number" min={0} step={1} label="Opening stock" hint="Recorded as an inventory movement" {...form.register('initialStock')} />
              </div>
            ) : null}
          </fieldset>
        </div>
        {!isNew ? <StatusPanel product={product} /> : <NewHelp />}
      </div>
    </form>
  );
}

function TaxPreview({ values }) {
  const price = toPaise(values.pricing?.priceInclusive) || 0;
  if (!price) return null;
  let rate = Number(values.pricing?.gstRate || 0);
  if (values.pricing?.gstRule === 'apparel_threshold') rate = price / 1.05 <= 250000 ? 5 : 18;
  const taxable = Math.round(price / (1 + rate / 100));
  const sale = values.pricing?.sale?.active ? toPaise(values.pricing.sale.priceInclusive) : null;
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 rounded border border-stone-300 bg-paper p-3 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs text-graphite-400">Taxable value</p>
        <p className="tabular">{inr(taxable)}</p>
      </div>
      <div>
        <p className="text-xs text-graphite-400">GST at {rate}%</p>
        <p className="tabular">{inr(price - taxable)}</p>
      </div>
      <div>
        <p className="text-xs text-graphite-400">Customer pays</p>
        <p className="font-semibold tabular">
          {sale ? (
            <>
              {inr(sale)} <s className="font-normal text-graphite-400">{inr(price)}</s>
            </>
          ) : (
            inr(price)
          )}
        </p>
      </div>
      {values.pricing?.gstRule === 'apparel_threshold' ? <p className="text-xs text-graphite-400 sm:col-span-3">Apparel rule: the rate is decided per piece at checkout from the price after any discount.</p> : null}
    </div>
  );
}

function NewHelp() {
  return (
    <aside className="space-y-3">
      <Notice tone="info" title="Before you publish">
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Use real photos of the product you ship.</li>
          <li>Do not claim protection ratings (bullet-proof, stab-proof, fire-proof) without a verified test certificate.</li>
          <li>Pepper sprays, knives, stun devices and anything with force insignia need legal review and are restricted to adults in India.</li>
          <li>Confirm the HSN code and GST rate with your accountant.</li>
        </ul>
      </Notice>
    </aside>
  );
}

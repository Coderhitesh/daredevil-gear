import Link from 'next/link';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { paragraphs } from '@/lib/format';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-stone-300 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
      <dt className="text-graphite-400">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

export default function ProductDetails({ product: p }) {
  const s = p.statutory;
  const missingStatutory = !s.countryOfOrigin || !(s.manufacturer || s.importer || s.packer) || !s.consumerCare;
  return (
    <section className="wrap mt-16 grid grid-cols-1 gap-12 border-t border-stone-300 pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
      <div>
        <h2 className="font-display text-display-md">About this product</h2>
        <div className="prose-ddg mt-4">
          {paragraphs(p.description).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {p.features.length ? (
          <>
            <h3 className="mt-10 font-display text-2xl">Features</h3>
            <ul className="prose-ddg mt-2 list-disc space-y-2 pl-5 marker:text-signal">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </>
        ) : null}

        {p.safety.warnings.length || p.safety.instructions ? (
          <div className="mt-10 rounded border-l-4 border-alert bg-white p-5" role="note" aria-label="Safety information">
            <h3 className="flex items-center gap-2 font-display text-xl text-alert">
              <AlertTriangle size={20} /> Safety information
            </h3>
            <ul className="mt-2 space-y-1.5 text-ink">
              {p.safety.warnings.map((w) => (
                <li key={w} className="font-medium">
                  {w}
                </li>
              ))}
            </ul>
            {p.safety.instructions ? <p className="mt-3 text-graphite">{p.safety.instructions}</p> : null}
            <Link href="/pages/product-safety" className="link mt-3 inline-block text-sm">
              Product safety and usage
            </Link>
          </div>
        ) : null}
      </div>

      <div className="space-y-10">
        {p.specifications.length ? (
          <div>
            <h2 className="font-display text-2xl">Specifications</h2>
            <dl className="mt-3 text-[15px]">
              {p.specifications.map((sp) => (
                <Row key={`${sp.label}-${sp.value}`} label={sp.label}>
                  {sp.value}
                </Row>
              ))}
            </dl>
          </div>
        ) : null}

        {p.safety.certificates.length ? (
          <div>
            <h2 className="font-display text-2xl">Certificates</h2>
            <ul className="mt-3 space-y-2">
              {p.safety.certificates.map((c) => (
                <li key={c.name} className="flex gap-2 text-[15px]">
                  <FileCheck2 size={18} className="mt-0.5 text-okay" />
                  <span>
                    {c.name}
                    {c.standard ? `, ${c.standard}` : ''}
                    {c.issuedBy ? ` (issued by ${c.issuedBy})` : ''}{' '}
                    {c.fileUrl ? (
                      <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="link">
                        View certificate
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h2 className="font-display text-2xl">Product information</h2>
          <dl className="mt-3 text-[15px]">
            <Row label="SKU">{p.sku}</Row>
            {p.hsnCode ? <Row label="HSN code">{p.hsnCode}</Row> : null}
            {s.netQuantity ? <Row label="Net quantity">{s.netQuantity}</Row> : null}
            {s.countryOfOrigin ? <Row label="Country of origin">{s.countryOfOrigin}</Row> : null}
            {s.manufacturer ? <Row label="Manufacturer">{s.manufacturer.name}{s.manufacturer.address ? `, ${s.manufacturer.address}` : ''}</Row> : null}
            {s.importer ? <Row label="Importer">{s.importer.name}{s.importer.address ? `, ${s.importer.address}` : ''}</Row> : null}
            {s.packer ? <Row label="Packer">{s.packer.name}{s.packer.address ? `, ${s.packer.address}` : ''}</Row> : null}
            {s.consumerCare ? <Row label="Consumer care">{s.consumerCare}</Row> : null}
            <Row label="Price">Inclusive of all taxes</Row>
          </dl>
          {missingStatutory ? (
            <p className="mt-3 text-sm text-graphite">
              For manufacturer, origin or consumer-care details about this product, <Link href="/contact" className="link">contact us</Link>.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

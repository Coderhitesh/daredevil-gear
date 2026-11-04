import ContactForm from '@/components/forms/ContactForm';
import PageHero from '@/components/layout/PageHero';

export const metadata = {
  title: 'Bulk & institutional orders',
  description: 'Request a quote for bulk orders of DareDevil Gears products for teams, institutions and expeditions.',
  alternates: { canonical: '/bulk-orders' },
};

export default function BulkOrdersPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: 'Bulk orders', href: '/bulk-orders' }]}
        kicker="Teams & institutions"
        title="Bulk & institutional orders"
        subtitle="Equipping a team, a unit, a school or an expedition? Tell us what you need, how many and where it should go. We will send a written quote within one working day."
      />
      <div className="wrap mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="panel p-5 sm:p-8">
          <ContactForm bulk />
        </div>
        <ul className="space-y-5 text-[15px] text-graphite">
          <li>
            <p className="font-medium text-ink">GST invoices</p>
            Quotes and invoices carry our GSTIN; add your GSTIN for input tax credit.
          </li>
          <li>
            <p className="font-medium text-ink">Delivery anywhere in India</p>
            Including consolidated dispatch to a single location.
          </li>
          <li>
            <p className="font-medium text-ink">Restricted items</p>
            Age-restricted products are supplied only in line with the law and our policies.
          </li>
        </ul>
      </div>
    </>
  );
}

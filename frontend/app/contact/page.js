
import { getShell } from '@/lib/api-server';
import ContactForm from '@/components/forms/ContactForm';
import PageHero from '@/components/layout/PageHero';

export const metadata = { title: 'Contact us', description: 'Contact DareDevil Gears by email, phone or WhatsApp. Bulk and institutional orders welcome.', alternates: { canonical: '/contact' } };
export const revalidate = 300;

export default async function ContactPage() {
  const { settings } = await getShell();
  const b = settings.business || {};
  return (
    <>
      <PageHero
        crumbs={[{ name: 'Contact us', href: '/contact' }]}
        kicker="We're here to help"
        title="Contact us"
        subtitle="Questions about a product, an order or a bulk purchase? We reply within one working day."
      />
      <div className="wrap pt-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-6 text-[15px]">
            <dl className="space-y-4">
              {b.email ? (
                <div>
                  <dt className="text-graphite-400">Email</dt>
                  <dd>
                    <a href={`mailto:${b.email}`} className="link text-lg">
                      {b.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {b.phone ? (
                <div>
                  <dt className="text-graphite-400">Phone</dt>
                  <dd>
                    <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="link text-lg">
                      {b.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {b.whatsapp ? (
                <div>
                  <dt className="text-graphite-400">WhatsApp</dt>
                  <dd>
                    <a href={`https://wa.me/${b.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="link text-lg">
                      Chat on WhatsApp
                    </a>
                  </dd>
                </div>
              ) : null}
              {b.hours ? (
                <div>
                  <dt className="text-graphite-400">Hours</dt>
                  <dd>{b.hours}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-graphite-400">Address</dt>
                <dd>
                  {b.legalName ? (
                    <>
                      {b.legalName}
                      <br />
                    </>
                  ) : null}
                  {b.registeredAddress || b.addressShort}
                </dd>
              </div>
            </dl>
            {b.mapEmbedUrl ? (
              <iframe src={b.mapEmbedUrl} title="Map to our office" className="aspect-[4/3] w-full rounded border border-stone-300" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            ) : null}
            {/* <p className="text-graphite">
              For complaints, see{' '}
              <Link href="/pages/grievance-redressal" className="link">
                Grievance Redressal
              </Link>
              .
            </p> */}
          </div>
          <div className="panel p-5 sm:p-8">
            <ContactForm />
          </div>
        </div>
      </div>
    </>
  );
}

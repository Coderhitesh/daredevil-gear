import Link from 'next/link';
import { apiGet, getShell } from '@/lib/api-server';
import GrievanceForm from '@/components/forms/GrievanceForm';
import { date } from '@/lib/format';
import PageHero from '@/components/layout/PageHero';

export const revalidate = 120;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await apiGet(`/pages/${slug}`, { revalidate: 120, allow404: true });
  if (!page) return { title: 'Page not found' };
  return { title: page.seo?.title || page.title, description: page.seo?.description || page.excerpt, alternates: { canonical: `/pages/${slug}` } };
}

export default async function CmsPage({ params }) {
  const { slug } = await params;
  const [page, shell] = await Promise.all([apiGet(`/pages/${slug}`, { revalidate: 120 }), getShell()]);
  const officer = page.officer;
  const biz = shell?.settings?.business || {};
  return (
    <>
      <PageHero compact crumbs={[{ name: page.title, href: `/pages/${slug}` }]} title={page.title} subtitle={`Last updated ${date(page.updatedAt)}`} />
      <div className="wrap pt-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="panel p-6 sm:p-10">
            {/* body is sanitised on the server (allow-listed tags only) */}
            <div className="prose-ddg" dangerouslySetInnerHTML={{ __html: page.body }} />
            {slug === 'grievance-redressal' ? (
              <div className="mt-10 max-w-prose">
                <h2 className="font-display text-2xl">Grievance Officer</h2>
                <dl className="mt-3 text-[15px]">
                  {[
                    ['Name', officer?.name],
                    ['Designation', officer?.designation],
                    ['Phone', officer?.phone],
                    ['Email', officer?.email],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[120px_1fr] border-b border-stone-300 py-2">
                      <dt className="text-graphite-400">{k}</dt>
                      <dd>{v || <span className="text-graphite-400">To be published</span>}</dd>
                    </div>
                  ))}
                </dl>
                <h2 className="mt-10 font-display text-2xl">Lodge a complaint</h2>
                <GrievanceForm />
              </div>
            ) : null}
          </article>
          <aside>
            <div className="panel p-5 text-[15px]">
              <p className="font-medium">Need help with an order?</p>
              <p className="mt-2 text-graphite">
                {biz.email ? `Email ${biz.email}` : ''}
                {biz.phone ? ` or call ${biz.phone}` : ''}
                {biz.hours ? `, ${biz.hours}` : ''}.
              </p>
              <Link href="/contact" className="link mt-3 inline-block">
                Contact us
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

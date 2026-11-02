import ProductCard from '../product/ProductCard';
import RailScroller from './RailScroller';

export default function ProductRail({ kicker, title, subtitle, products = [], link, linkLabel, markNew = false }) {
  if (!products.length) return null;
  return (
    <section className="wrap mt-16 sm:mt-20">
      <RailScroller head={{ kicker, title, subtitle, link, linkLabel }}>
        <ul className="flex snap-x snap-mandatory gap-4 sm:gap-5">
          {products.slice(0, 12).map((p, k) => (
            <li key={p.id} style={{ '--i': k }} className={`${k < 5 ? 'reveal ' : ''}w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-[31%] xl:w-[calc(25%-15px)]`}>
              <ProductCard product={p} markNew={markNew} />
            </li>
          ))}
        </ul>
      </RailScroller>
    </section>
  );
}

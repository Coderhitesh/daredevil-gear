import { ProductGridSkeleton } from '@/components/product/ProductCard';

export default function Loading() {
  return (
    <div className="wrap pt-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-8 h-12 w-72" />
      <ProductGridSkeleton />
    </div>
  );
}

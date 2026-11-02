'use client';

import { use } from 'react';
import ProductEditor from '@/components/product/ProductEditor';

export default function ProductPage({ params }) {
  const { id } = use(params);
  return <ProductEditor id={id} />;
}

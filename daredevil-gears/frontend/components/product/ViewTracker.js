'use client';

import { useEffect } from 'react';
import { useLocal } from '@/lib/store';

export default function ViewTracker({ id }) {
  const viewed = useLocal((s) => s.viewed);
  useEffect(() => viewed(id), [id, viewed]);
  return null;
}

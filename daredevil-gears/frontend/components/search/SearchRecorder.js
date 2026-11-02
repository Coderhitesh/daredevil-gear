'use client';

import { useEffect } from 'react';
import { useLocal } from '@/lib/store';

export default function SearchRecorder({ q }) {
  const searched = useLocal((s) => s.searched);
  useEffect(() => searched(q), [q, searched]);
  return null;
}

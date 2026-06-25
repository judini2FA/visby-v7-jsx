'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initNative } from '@/lib/native';

export function NativeBootstrap() {
  const router = useRouter();

  useEffect(() => {
    initNative((path) => router.push(path));
  // router identity is stable — intentional empty-ish deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

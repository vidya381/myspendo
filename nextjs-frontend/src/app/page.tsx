'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Always redirect to dashboard (works for both authenticated and guest users)
    router.push('/dashboard');
  }, [router]);

  return null;
}

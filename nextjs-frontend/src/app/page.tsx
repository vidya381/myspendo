'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { token, initialized } = useAuth();

  useEffect(() => {
    // Wait for auth context to initialize (check localStorage)
    if (!initialized) return;

    // Redirect based on authentication status
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [token, initialized, router]);

  // Show nothing while checking auth
  return null;
}

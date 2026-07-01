'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { AdminRole } from '@/lib/admin';

// The caller's DB-backed admin role (via /api/admin/me) — so admin pages recognize DB-granted admins,
// not just the env bootstrap list. `loading` stays true until the first result, so gates can avoid an
// "access denied" flash while the role resolves. Server routes remain the real enforcement.
export function useAdminRole(): { role: AdminRole | null; isAdmin: boolean; loading: boolean } {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) { setRole(null); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) { if (!cancelled) { setRole(null); setLoading(false); } return; }
        const res = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } });
        const j = res.ok ? await res.json() : {};
        if (!cancelled) { setRole((j.role ?? null) as AdminRole | null); setLoading(false); }
      } catch {
        if (!cancelled) { setRole(null); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, authenticated, getAccessToken]);

  return { role, isAdmin: !!role, loading };
}

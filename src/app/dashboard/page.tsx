'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
    const { ready, authenticated, user, logout } = usePrivy();
    const router = useRouter();

    useEffect(() => {
          if (ready && !authenticated) {
                  router.push('/login');
          }
    }, [ready, authenticated, router]);

    if (!ready || !authenticated) {
          return (
                  <div className="min-h-screen bg-[#0E1420] flex items-center justify-center">
                    <div className="text-white text-lg">Loading...</div>
                  </div>
                );
    }

    // Get the embedded Solana wallet Privy creates automatically
    const solanaWallet = user?.linkedAccounts?.find(
          (a) => a.type === 'wallet' && a.walletClientType === 'privy'
        ) as { address?: string } | undefined;

    const walletAddress = solanaWallet?.address ?? 'Generating wallet...';

    return (
          <div className="min-h-screen bg-[#0E1420] text-white">
            <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
              <div className="flex items-center justify-between mb-10">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent">
                  Dashboard
                </h1>
                <button
                  onClick={logout}
                  className="text-sm text-gray-400 hover:text-white transition border border-white/10 px-4 py-2 rounded-lg"
                >
                  Sign out
                </button>
              </div>

      {/* Wallet Card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Your Solana Wallet</p>
                <p className="font-mono text-sm text-[#3EFFD8] break-all">{walletAddress}</p>
                <p className="mt-3 text-xs text-gray-500">
                  This wallet was automatically created for you by Visby. It lives in the Privy secure enclave.
                </p>
              </div>

      {/* User info */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Account</p>
                <p className="text-sm">{user?.email?.address ?? user?.google?.email ?? 'Connected via wallet'}</p>
              </div>

      {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <Link
                  href="/mint"
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-[#3EFFD8]/40 transition group"
                >
                  <div className="text-2xl mb-2">➕</div>
                  <div className="font-semibold">Mint Item NFT</div>
                  <div className="text-sm text-gray-400 mt-1">Register a new physical product</div>
                </Link>
                <Link
                  href="/"
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-[#5B9BFF]/40 transition group"
                >
                  <div className="text-2xl mb-2">🛒</div>
                  <div className="font-semibold">Browse Marketplace</div>
                  <div className="text-sm text-gray-400 mt-1">Buy and sell verified items</div>
                </Link>
              </div>
            </div>
          </div>
        );
}

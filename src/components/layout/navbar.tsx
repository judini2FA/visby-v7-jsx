'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

export function Navbar() {
    const { ready, authenticated, login, logout } = usePrivy();

  return (
        <nav className="sticky top-0 z-50 bg-[#0E1420]/95 backdrop-blur-md border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
    {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent">
                Visby
              </span>
            </Link>

    {/* Nav Links */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <Link href="/" className="hover:text-white transition">Marketplace</Link>
    {authenticated && (
                <>
                  <Link href="/mint" className="hover:text-white transition">Mint</Link>
                  <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
                </>
              )}
            </div>

    {/* Auth */}
        <div>
    {!ready ? (
                <div className="w-20 h-8 bg-white/5 rounded-lg animate-pulse" />
              ) : authenticated ? (
                <button
                  onClick={logout}
                  className="text-sm border border-white/20 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:border-white/40 transition"
                >
                  Sign out
            </button>
              ) : (
                <button
                  onClick={login}
                  className="text-sm px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-[#3EFFD8] to-[#5B9BFF] text-black hover:opacity-90 transition"
                >
                  Sign in
            </button>
              )}
            </div>
          </div>
        </nav>
      );
    }

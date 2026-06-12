'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

export function Navbar() {
    const { ready, authenticated, login, logout } = usePrivy();

  return (
        <nav className="sticky top-0 z-50 bg-[var(--glass-bg-strong)] backdrop-blur-xl border-b border-[var(--glass-border)]">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
    {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent">
                Visby
              </span>
            </Link>

    {/* Nav Links */}
        <div className="hidden md:flex items-center gap-6 text-sm text-[var(--text-muted)]">
              <Link href="/" className="hover:text-[var(--text-strong)] transition">Marketplace</Link>
    {authenticated && (
                <>
                  <Link href="/mint" className="hover:text-[var(--text-strong)] transition">Mint</Link>
                  <Link href="/dashboard" className="hover:text-[var(--text-strong)] transition">Dashboard</Link>
                </>
              )}
            </div>

    {/* Auth */}
        <div>
    {!ready ? (
                <div className="w-20 h-8 bg-[var(--glass-bg)] rounded-xl animate-pulse" />
              ) : authenticated ? (
                <button
                  onClick={logout}
                  className="text-sm border border-[var(--glass-border)] px-4 py-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-strong)] transition"
                >
                  Sign out
            </button>
              ) : (
                <button
                  onClick={login}
                  className="text-sm px-4 py-2 rounded-full font-semibold bg-gradient-to-r from-[#6DE4D5] via-[#59B4F5] to-[#D54AF2] text-white hover:opacity-90 transition"
                >
                  Sign in
            </button>
              )}
            </div>
          </div>
        </nav>
      );
    }

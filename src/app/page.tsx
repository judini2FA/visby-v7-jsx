import Link from 'next/link';

export default function HomePage() {
  return (
      <div className="min-h-screen bg-[#0E1420] flex flex-col items-center justify-center text-white">
            <div className="text-center max-w-2xl px-6">
                    <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent">
                              Visby
                                      </h1>
                                              <p className="text-xl text-gray-400 mb-8">
                                                        Fraud-Free NFT Provenance Marketplace
                                                                </p>
                                                                        <div className="flex gap-4 justify-center">
                                                                                  <Link
                                                                                              href="/login"
                                                                                                          className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#3EFFD8] to-[#5B9BFF] text-black font-semibold hover:opacity-90 transition"
                                                                                                                    >
                                                                                                                                Sign In
                                                                                                                                          </Link>
                                                                                                                                                    <Link
                                                                                                                                                                href="/dashboard"
                                                                                                                                                                            className="px-6 py-3 rounded-lg border border-white/20 hover:border-white/40 transition"
                                                                                                                                                                                      >
                                                                                                                                                                                                  Dashboard
                                                                                                                                                                                                            </Link>
                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                              </div>
                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                }

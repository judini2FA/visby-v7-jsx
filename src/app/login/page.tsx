'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { ready, authenticated, login } = usePrivy();
    const router = useRouter();

      useEffect(() => {
          if (ready && authenticated) {
                router.push('/dashboard');
                    }
                      }, [ready, authenticated, router]);

                        return (
                            <div className="min-h-screen bg-[#0E1420] flex flex-col items-center justify-center text-white">
                                  <div className="w-full max-w-md px-6">
                                          {/* Logo */}
                                                  <div className="text-center mb-10">
                                                            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent">
                                                                        Visby
                                                                                  </h1>
                                                                                            <p className="mt-2 text-gray-400 text-sm">Fraud-Free NFT Provenance Marketplace</p>
                                                                                                    </div>
                                                                                                    
                                                                                                            {/* Card */}
                                                                                                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
                                                                                                                              <h2 className="text-2xl font-semibold mb-2">Sign in</h2>
                                                                                                                                        <p className="text-gray-400 text-sm mb-8">
                                                                                                                                                    Use your email or existing wallet. No crypto knowledge needed.
                                                                                                                                                              </p>
                                                                                                                                                              
                                                                                                                                                                        <button
                                                                                                                                                                                    onClick={login}
                                                                                                                                                                                                disabled={!ready}
                                                                                                                                                                                                            className="w-full py-3 px-6 rounded-xl font-semibold text-black bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                                                                                                                                                      >
                                                                                                                                                                                                                                  {!ready ? 'Loading...' : 'Sign in with Visby'}
                                                                                                                                                                                                                                            </button>
                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                      <p className="mt-6 text-center text-xs text-gray-500">
                                                                                                                                                                                                                                                                  By signing in, you agree to our Terms of Service and Privacy Policy.
                                                                                                                                                                                                                                                                            </p>
                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                            <p className="mt-6 text-center text-sm text-gray-500">
                                                                                                                                                                                                                                                                                                      Don\'t have an account? Just sign in — we\'ll create one automatically.
                                                                                                                                                                                                                                                                                                              </p>
                                                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                          );
                                                                                                                                                                                                                                                                                                                          }

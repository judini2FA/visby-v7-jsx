export function Footer() {
  return (
      <footer className="border-t border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-xl py-8 px-6">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-[var(--text-muted)]">
                              <span className="bg-gradient-to-r from-[#3EFFD8] via-[#5B9BFF] to-[#C742FF] bg-clip-text text-transparent font-semibold">Visby</span>
                                        {' '}&mdash; Fraud-Free NFT Provenance Marketplace
                                                </div>
                                                        <div className="flex gap-6 text-xs text-[var(--text-muted)]">
                                                                  <span>Solana Devnet</span>
                                                                            <span>Metaplex Core</span>
                                                                                      <span>Privy Auth</span>
                                                                                              </div>
                                                                                                      <div className="text-xs text-[var(--text-muted)]">
                                                                                                                &copy; {new Date().getFullYear()} Visby. All rights reserved.
                                                                                                                        </div>
                                                                                                                              </div>
                                                                                                                                  </footer>
                                                                                                                                    );
                                                                                                                                    }

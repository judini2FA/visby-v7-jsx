import { Package, QrCode, ShieldCheck, Repeat2 } from 'lucide-react';

const steps = [
  {
      icon: Package,
          title: 'Item Gets Registered',
              description:
                    'A brand or seller registers their product serial number. Visby mints a provenance NFT on Solana in under a second for less than a cent.',
                        step: '01',
                          },
                            {
                                icon: QrCode,
                                    title: 'Physical Tag Applied',
                                        description:
                                              'A QR code or NFC chip is applied to the product linking it to its on-chain record. Scan it anytime to verify authenticity.',
                                                  step: '02',
                                                    },
                                                      {
                                                          icon: ShieldCheck,
                                                              title: 'Buyer Verifies',
                                                                  description:
                                                                        'Before purchase, buyers scan the tag or visit visby.io/item/[serial] to see the full ownership history, verification badge, and current listing.',
                                                                            step: '03',
                                                                              },
                                                                                {
                                                                                    icon: Repeat2,
                                                                                        title: 'Ownership Transfers On-Chain',
                                                                                            description:
                                                                                                  'Every resale updates the provenance record. The chain of custody is permanent, public, and tamper-proof forever.',
                                                                                                      step: '04',
                                                                                                        },
                                                                                                        ];

                                                                                                        export function HowItWorks() {
                                                                                                          return (
                                                                                                              <section className="py-24 bg-muted/30">
                                                                                                                    <div className="container">
                                                                                                                            <div className="text-center mb-16">
                                                                                                                                      <h2 className="text-3xl md:text-4xl font-bold mb-4">How Visby Works</h2>
                                                                                                                                                <p className="text-muted-foreground max-w-xl mx-auto">
                                                                                                                                                            From mint to resale, every step is recorded on-chain. No fakes. No disputes. Just proof.
                                                                                                                                                                      </p>
                                                                                                                                                                              </div>

                                                                                                                                                                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                                                                                                                                                                                                {steps.map((step, i) => (
                                                                                                                                                                                                            <div key={i} className="relative">
                                                                                                                                                                                                                          {i < steps.length - 1 && (
                                                                                                                                                                                                                                          <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-border to-transparent z-0" />
                                                                                                                                                                                                                                                        )}
                                                                                                                                                                                                                                                                      <div className="relative z-10 flex flex-col items-start gap-4">
                                                                                                                                                                                                                                                                                      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/10 to-amber-400/10 border border-purple-200/50 dark:border-purple-800/50">
                                                                                                                                                                                                                                                                                                        <step.icon className="w-7 h-7 text-purple-600" />
                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                        <div>
                                                                                                                                                                                                                                                                                                                                                          <div className="text-xs font-mono text-purple-400 mb-1">{step.step}</div>
                                                                                                                                                                                                                                                                                                                                                                            <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                                                                                                                                                                                                                                                                                                                                                                                              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                                                                                                                                                                                                                                                                                                                                                                                                              </div>
                                                                                                                                                                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                  ))}
                                                                                                                                                                                                                                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    </section>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      }
import { Shield, Zap, Globe, Lock } from 'lucide-react';

const badges = [
  { icon: Shield, label: 'Fraud-proof provenance', sub: 'Every serial verified on-chain' },
    { icon: Zap, label: 'Solana speed', sub: '400ms finality, $0.00025/mint' },
      { icon: Globe, label: '135+ currencies', sub: 'Pay or receive in any currency' },
        { icon: Lock, label: 'Stripe-secured payments', sub: 'PCI compliant card processing' },
        ];

        export function TrustBadges() {
          return (
              <div className="border-y border-border/40 bg-muted/20 py-6">
                    <div className="container">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      {badges.map((badge, i) => (
                                                  <div key={i} className="flex items-center gap-3">
                                                                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-600/10 flex items-center justify-center">
                                                                                <badge.icon className="w-4 h-4 text-purple-600" />
                                                                                              </div>
                                                                                                            <div>
                                                                                                                            <div className="text-xs font-semibold">{badge.label}</div>
                                                                                                                                            <div className="text-xs text-muted-foreground">{badge.sub}</div>
                                                                                                                                                          </div>
                                                                                                                                                                      </div>
                                                                                                                                                                                ))}
                                                                                                                                                                                        </div>
                                                                                                                                                                                              </div>
                                                                                                                                                                                                  </div>
                                                                                                                                                                                                    );
                                                                                                                                                                                                    }
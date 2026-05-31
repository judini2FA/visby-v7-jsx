import { HeroSection } from '@/components/home/hero-section';
import { FeaturedListings } from '@/components/home/featured-listings';
import { HowItWorks } from '@/components/home/how-it-works';
import { TrustBadges } from '@/components/home/trust-badges';
import { PayWithVisbyCTA } from '@/components/home/pay-with-visby-cta';

export default function HomePage() {
  return (
      <div className="flex flex-col gap-0">
            <HeroSection />
                  <TrustBadges />
                        <FeaturedListings />
                              <HowItWorks />
                                    <PayWithVisbyCTA />
                                        </div>
                                          );
                                          }
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseAdminClient } from '@/lib/supabase/server';
import { transferProvenanceNFT } from '@/lib/solana/mint-provenance-nft';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  });

  export async function POST(request: Request) {
    const body = await request.text();
      const signature = request.headers.get('stripe-signature')!;

        let event: Stripe.Event;

          try {
              event = stripe.webhooks.constructEvent(
                    body,
                          signature,
                                process.env.STRIPE_WEBHOOK_SECRET!
                                    );
                                      } catch (err) {
                                          return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
                                            }

                                              if (event.type === 'payment_intent.succeeded') {
                                                  const paymentIntent = event.data.object as Stripe.PaymentIntent;
                                                      const { item_id, serial_number } = paymentIntent.metadata;

                                                          const supabase = createServerSupabaseAdminClient();

                                                              // Get item and buyer info
                                                                  const { data: item } = await supabase
                                                                        .from('items')
                                                                              .select('*, profiles(wallet_address)')
                                                                                    .eq('id', item_id)
                                                                                          .single();

                                                                                              if (item) {
                                                                                                    // Transfer NFT on-chain
                                                                                                          const buyerWallet = paymentIntent.metadata.buyer_wallet ?? 'visby-custodial';
                                                                                                                await transferProvenanceNFT(
                                                                                                                        item.nft_mint_address,
                                                                                                                                item.owner_wallet,
                                                                                                                                        buyerWallet,
                                                                                                                                                paymentIntent.amount / 100,
                                                                                                                                                        'USD'
                                                                                                                                                              );

                                                                                                                                                                    // Update item status
                                                                                                                                                                          await supabase
                                                                                                                                                                                  .from('items')
                                                                                                                                                                                          .update({ status: 'sold', sold_at: new Date().toISOString() })
                                                                                                                                                                                                  .eq('id', item_id);

                                                                                                                                                                                                        // Record provenance event
                                                                                                                                                                                                              await supabase.from('provenance_events').insert({
                                                                                                                                                                                                                      item_id,
                                                                                                                                                                                                                              serial_number,
                                                                                                                                                                                                                                      event_type: 'sale',
                                                                                                                                                                                                                                              from_wallet: item.owner_wallet,
                                                                                                                                                                                                                                                      to_wallet: buyerWallet,
                                                                                                                                                                                                                                                              priceimport { createBrowserClient } from '@supabase/auth-helpers-nextjs';
                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                              export function createClientSupabaseClient() {
                                                                                                                                                                                                                                                                return createBrowserClient(
                                                                                                                                                                                                                                                                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                                                                                                                                                                                                                                                                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                                                                                                                                                                                                                                                                          );
                                                                                                                                                                                                                                                                          }_usd: paymentIntent.amount / 100,
                                                                                                                                                                                                                                                                      stripe_payment_intent_id: paymentIntent.id,
                                                                                                                                                                                                                                                                              timestamp: new Date().toISOString(),
                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                          }

                                                                                                                                                                                                                                                                                            return NextResponse.json({ received: true });
                                                                                                                                                                                                                                                                                            }
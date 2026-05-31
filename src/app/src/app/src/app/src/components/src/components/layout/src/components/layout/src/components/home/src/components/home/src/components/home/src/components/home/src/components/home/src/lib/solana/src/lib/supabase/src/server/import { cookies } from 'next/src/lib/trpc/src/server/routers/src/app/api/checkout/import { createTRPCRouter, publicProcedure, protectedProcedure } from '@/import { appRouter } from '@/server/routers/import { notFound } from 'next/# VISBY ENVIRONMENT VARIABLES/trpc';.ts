import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  });

  const checkoutSchema = z.object({
    itemId: z.string(),
      itemName: z.string(),
        serialNumber: z.string(),
          priceUsd: z.number().positive(),
            buyerEmail: z.string().email().optional(),
              successUrl: z.string().url(),
                cancelUrl: z.string().url(),
                });

                export async function POST(request: Request) {
                  try {
                      const body = await request.json();
                          const { itemId, itemName, serialNumber, priceUsd, buyerEmail, successUrl, cancelUrl } =
                                checkoutSchema.parse(body);

                                    // Visby takes 2.5% — platform fee added to price
                                        const platformFeePercent = 0.025;
                                            const platformFeeCents = Math.round(priceUsd * 100 * platformFeePercent);
                                                const totalCents = Math.round(priceUsd * 100) + platformFeeCents;

                                                    const session = await stripe.checkout.sessions.create({
                                                          mode: 'payment',
                                                                customer_email: buyerEmail,
                                                                      line_items: [
                                                                              {
                                                                                        price_data: {
                                                                                                    currency: 'usd',
                                                                                                                product_data: {
                                                                                                                              name: itemName,
                                                                                                                                            description: `Serial: ${serialNumber} | Verified on Solana via Visby`,
                                                                                                                                                          metadata: { item_id: itemId, serial_number: serialNumber },
                                                                                                                                                                      },
                                                                                                                                                                                  unit_amount: totalCents,
                                                                                                                                                                                            },
                                                                                                                                                                                                      quantity: 1,
                                                                                                                                                                                                              },
                                                                                                                                                                                                                    ],
                                                                                                                                                                                                                          payment_intent_data: {
                                                                                                                                                                                                                                  metadata: {
                                                                                                                                                                                                                                            item_id: itemId,
                                                                                                                                                                                                                                                      serial_number: serialNumber,
                                                                                                                                                                                                                                                                platform_fee_cents: platformFeeCents,
                                                                                                                                                                                                                                                                        },
                                                                                                                                                                                                                                                                              },
                                                                                                                                                                                                                                                                                    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
                                                                                                                                                                                                                                                                                          cancel_url: cancelUrl,
                                                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                                                                  return NextResponse.json({ url: session.url, sessionId: session.id });
                                                                                                                                                                                                                                                                                                    } catch (error) {
                                                                                                                                                                                                                                                                                                        console.error('Checkout error:', error);
                                                                                                                                                                                                                                                                                                            return NextResponse.json(
                                                                                                                                                                                                                                                                                                                  { error: 'Failed to create checkout session' },
                                                                                                                                                                                                                                                                                                                        { status: 500 }
                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                              }
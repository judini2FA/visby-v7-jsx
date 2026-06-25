import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

export type MerchantKeys = {
  publishable_key: string;
  secret_key: string;
  webhook_secret: string;
};

export function generateMerchantKeys(): MerchantKeys {
  return {
    publishable_key: 'pk_visby_' + crypto.randomBytes(24).toString('hex'),
    secret_key: 'sk_visby_' + crypto.randomBytes(32).toString('hex'),
    webhook_secret: 'whsec_' + crypto.randomBytes(32).toString('hex'),
  };
}

// Secret keys are stored only as this hash — the plaintext is shown to the merchant once.
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function lastFour(secret: string): string {
  return secret.slice(-4);
}

// Stripe-style signature: HMAC the timestamped payload so the merchant can verify
// authenticity and reject replays.
export function signWebhookPayload(
  payloadJson: string,
  webhookSecret: string,
  timestampSec: number
): string {
  const hmac = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestampSec}.${payloadJson}`)
    .digest('hex');
  return `t=${timestampSec},v1=${hmac}`;
}

function missingSchema(error: any): boolean {
  const code = error?.code;
  if (code === '42P01' || code === 'PGRST205') return true;
  return typeof error?.message === 'string' && error.message.includes('does not exist');
}

export async function getMerchantByPublishableKey(pk: string): Promise<any | null> {
  if (!pk) return null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('publishable_key', pk)
      .eq('active', true)
      .maybeSingle();
    if (error) {
      if (missingSchema(error)) return null;
      return null;
    }
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getMerchantBySecretKey(sk: string): Promise<any | null> {
  if (!sk) return null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('secret_key_hash', hashSecret(sk))
      .eq('active', true)
      .maybeSingle();
    if (error) {
      if (missingSchema(error)) return null;
      return null;
    }
    return data ?? null;
  } catch {
    return null;
  }
}

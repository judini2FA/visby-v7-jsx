export const PRELAUNCH_INTERESTS = [
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'watches', label: 'Watches' },
  { id: 'bags', label: 'Bags' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'jewelry', label: 'Jewelry' },
  { id: 'collectibles', label: 'Collectibles' },
] as const;

export type PrelaunchInterest = (typeof PRELAUNCH_INTERESTS)[number]['id'];

export const REFERRAL_BOOST = 5;

// Below this, a public "N people waiting" number reads as empty rather than exclusive.
export const COUNTER_MIN = Number(process.env.NEXT_PUBLIC_PRELAUNCH_COUNTER_MIN ?? 100);

export type PrelaunchStanding = {
  refCode: string;
  position: number;
  total: number;
  referrals: number;
  interests: string[];
};

export const PREVIEW_COOKIE = 'visby_preview';

// Cookie value = HMAC(PRELAUNCH_KEY, fixed label). Rotating PRELAUNCH_KEY revokes every issued cookie.
// Web Crypto so it runs in the edge middleware.
export async function previewToken(key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('visby-preview-v1')));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

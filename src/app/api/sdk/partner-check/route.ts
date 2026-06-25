import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// Normalize a raw hostname or URL to a bare host for exact comparison: drop protocol, leading "www.",
// any path/query/hash, and a :port, then lowercase.
function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.split(':')[0];
  s = s.replace(/^www\./, '');
  return s;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function reply(partner: boolean, merchant_name: string | null = null): NextResponse {
  return NextResponse.json({ partner, merchant_name }, { status: 200, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const domain = normalizeDomain(req.nextUrl.searchParams.get('domain') ?? '');
  if (!domain) return reply(false);

  // Partner status drives the extension's "Includes Visby NFT provenance" badge, so it MUST be exact and
  // fail CLOSED. A false positive would advertise an NFT on a non-partner (or lookalike) site — the one
  // thing this feature must never do. We therefore match ONLY an explicit, admin-verified domain: never a
  // slug or substring (slug "nike" must not promote "nike.attacker.com"). Unknown → non-partner, no NFT.

  // 1. Env stopgap allowlist — exact, normalized. VISBY_PARTNER_DOMAINS=shop.example.com,checkout.acme.io
  const envList = (process.env.VISBY_PARTNER_DOMAINS ?? '')
    .split(',').map(normalizeDomain).filter(Boolean);
  if (envList.includes(domain)) return reply(true);

  // 2. Verified merchant domain (the `domain` column is set by Visby ops only after confirming the
  //    merchant controls it — see migration_merchant_domain.sql). Absent column / table → fail closed.
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('merchants').select('name, domain').eq('active', true).not('domain', 'is', null);
    if (error || !data) return reply(false);

    const match = data.find((m) => m.domain && normalizeDomain(String(m.domain)) === domain);
    return match ? reply(true, match.name ?? null) : reply(false);
  } catch {
    return reply(false);
  }
}

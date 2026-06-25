import { createServiceClient } from '@/lib/supabase/service';

// Brand serial-number registry check. Given a serial, decide whether it claims a registered brand and,
// if so, whether it falls inside that brand's registered (genuine) space. Counterfeit signal = claims a
// brand but is outside its ranges / explicitly revoked. Fail-open everywhere: any DB error, a missing
// table (migration not run), or simply no active rules → 'unregistered', so minting is never blocked by
// the registry being absent. Only a POSITIVE match against a registered-but-invalid serial returns
// 'rejected'. See supabase/migration_brand_registry.sql.

export type SerialVerdict =
  | { verdict: 'unregistered' }
  | { verdict: 'verified'; brand: string; brand_slug: string }
  | { verdict: 'rejected'; brand: string; brand_slug: string; reason: string };

type BrandRef = { id: string; slug: string; display_name: string };
type RuleRow = {
  brand_id: string;
  claim_regex: string;
  valid_regex: string | null;
  range_prefix: string | null;
  range_min: string | null;
  range_max: string | null;
  brand_registry: BrandRef | BrandRef[] | null;
};
type FlagRow = { brand_id: string; flag: string };

function brandOf(rule: RuleRow): BrandRef | null {
  const b = rule.brand_registry;
  if (!b) return null;
  return Array.isArray(b) ? (b[0] ?? null) : b;
}

// Regexes are admin-authored (the registry write API is admin-gated) so the source is trusted; a
// malformed pattern is treated as non-matching rather than throwing.
function matches(pattern: string | null, value: string): boolean {
  if (!pattern) return false;
  try { return new RegExp(pattern).test(value); } catch { return false; }
}

function withinRange(core: string, min: string | null, max: string | null): boolean {
  const numeric = (s: string) => /^\d+$/.test(s);
  if (min != null && max != null && numeric(core) && numeric(min) && numeric(max)) {
    const n = BigInt(core), lo = BigInt(min), hi = BigInt(max);
    return n >= lo && n <= hi;
  }
  if (min != null && core < min) return false;
  if (max != null && core > max) return false;
  return true;
}

// A claimed serial is genuine under a rule if it passes the rule's tighter validity (if any) AND its
// range (if any). A rule with neither asserts the whole claim-format is genuine.
function ruleSatisfied(rule: RuleRow, serial: string): boolean {
  if (rule.valid_regex && !matches(rule.valid_regex, serial)) return false;
  if (rule.range_min != null || rule.range_max != null) {
    const core = rule.range_prefix && serial.startsWith(rule.range_prefix)
      ? serial.slice(rule.range_prefix.length)
      : serial;
    if (!withinRange(core, rule.range_min, rule.range_max)) return false;
  }
  return true;
}

export async function checkSerial(serialRaw: string): Promise<SerialVerdict> {
  try {
    return await checkSerialInner(serialRaw);
  } catch {
    // A registry outage (Supabase blip, etc.) must NEVER block minting — fail open.
    return { verdict: 'unregistered' };
  }
}

async function checkSerialInner(serialRaw: string): Promise<SerialVerdict> {
  const serial = (serialRaw ?? '').trim();
  if (!serial) return { verdict: 'unregistered' };

  const supabase = createServiceClient();

  const { data: rules, error } = await supabase
    .from('brand_serial_rules')
    .select('brand_id, claim_regex, valid_regex, range_prefix, range_min, range_max, brand_registry!inner(id, slug, display_name, is_active)')
    .eq('is_active', true)
    .eq('brand_registry.is_active', true);

  if (error || !rules || rules.length === 0) return { verdict: 'unregistered' };

  // Group active rules by the brand that claims this serial.
  const claimedByBrand = new Map<string, { brand: BrandRef; rules: RuleRow[] }>();
  for (const r of rules as unknown as RuleRow[]) {
    if (!matches(r.claim_regex, serial)) continue;
    const brand = brandOf(r);
    if (!brand) continue;
    const entry = claimedByBrand.get(brand.id) ?? { brand, rules: [] };
    entry.rules.push(r);
    claimedByBrand.set(brand.id, entry);
  }

  if (claimedByBrand.size === 0) return { verdict: 'unregistered' };

  // Explicit per-serial overrides beat the ranges (recall / stolen / manual allow).
  const { data: flagRows } = await supabase
    .from('brand_serial_flags')
    .select('brand_id, flag')
    .eq('serial_number', serial);
  const flags = new Map<string, string>();
  for (const f of (flagRows ?? []) as FlagRow[]) flags.set(f.brand_id, f.flag);

  // Prefer a verified verdict if any claiming brand accepts the serial; otherwise reject.
  let rejection: SerialVerdict | null = null;
  for (const { brand, rules: brandRules } of claimedByBrand.values()) {
    const flag = flags.get(brand.id);
    if (flag === 'allow') return { verdict: 'verified', brand: brand.display_name, brand_slug: brand.slug };
    if (flag === 'revoked' || flag === 'stolen' || flag === 'recalled') {
      rejection ??= { verdict: 'rejected', brand: brand.display_name, brand_slug: brand.slug,
        reason: `This serial is marked ${flag} in ${brand.display_name}'s registry.` };
      continue;
    }
    if (brandRules.some(r => ruleSatisfied(r, serial))) {
      return { verdict: 'verified', brand: brand.display_name, brand_slug: brand.slug };
    }
    rejection ??= { verdict: 'rejected', brand: brand.display_name, brand_slug: brand.slug,
      reason: `This serial matches ${brand.display_name}'s format but isn't in their registered range — it may be counterfeit.` };
  }

  return rejection ?? { verdict: 'unregistered' };
}

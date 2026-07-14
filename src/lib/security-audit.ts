import { createServiceClient } from '@/lib/supabase/service';
import { emailWallet } from '@/lib/email';
import { securityAlert } from '@/lib/email-templates';

// Append-only audit trail for sensitive account events. Like notify(), every error is swallowed: a
// failed audit write (missing table pre-migration, transient failure) must NEVER break the auth,
// settlement, or settings flow it observes. The audit table is the source of truth; email alerts are
// a best-effort secondary signal.

export type SecurityEvent =
  | 'sign_in'
  | 'sign_in_new_device'
  | 'mfa_enrolled'
  | 'mfa_removed'
  | 'passkey_added'
  | 'passkey_removed'
  | 'session_revoked'
  | 'sessions_revoked_others'
  | 'payout_destination_changed'
  | 'payment_method_changed'
  | 'admin_granted'
  | 'admin_revoked'
  | 'kyc_override'
  | 'business_verification_override'
  | 'listing_delisted'
  | 'user_flagged'
  | 'user_suspended'
  | 'user_banned'
  | 'user_reinstated'
  | 'report_resolved'
  | 'item_authenticated'
  | 'dispute_resolved'
  | 'brand_serial_flagged'
  | 'brand_registry_updated'
  | 'legal_doc_uploaded'
  | 'payout_retried';

export type SecurityAuditInput = {
  wallet: string;
  event: SecurityEvent;
  detail?: Record<string, unknown>;
  ip?: string | null;
  user_agent?: string | null;
};

// High-sensitivity events that also trigger a best-effort email alert to the account owner.
const ALERT_LABELS: Partial<Record<SecurityEvent, string>> = {
  sign_in_new_device:          'a sign-in from a new device',
  mfa_enrolled:                'two-factor authentication was enabled',
  mfa_removed:                 'two-factor authentication was removed',
  passkey_added:               'a new passkey was added',
  passkey_removed:             'a passkey was removed',
  payout_destination_changed:  'your payout destination was changed',
  payment_method_changed:      'a payment method was changed',
};

export async function logSecurityEvent(e: SecurityAuditInput): Promise<void> {
  if (!e.wallet) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('security_audit_log').insert({
      wallet:     e.wallet,
      event:      e.event,
      detail:     e.detail ?? null,
      ip:         e.ip ?? null,
      user_agent: e.user_agent ?? null,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('security audit skipped', err);
  }

  // Best-effort email alert on high-sensitivity events — a secondary signal that NEVER blocks the
  // observed flow (fail-soft, and a no-op when RESEND_API_KEY isn't set).
  const label = ALERT_LABELS[e.event];
  if (label) {
    try {
      await emailWallet(e.wallet, securityAlert({ label, when: new Date().toUTCString(), device: e.user_agent ?? null }));
    } catch { /* email is a best-effort secondary signal */ }
  }
}

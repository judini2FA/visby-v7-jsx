import { createServiceClient } from '@/lib/supabase/service';

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
  | 'payment_method_changed';

export type SecurityAuditInput = {
  wallet: string;
  event: SecurityEvent;
  detail?: Record<string, unknown>;
  ip?: string | null;
  user_agent?: string | null;
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
}

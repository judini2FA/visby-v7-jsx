import { describe, it, expect } from 'vitest';
import {
  STEP_UP_PREFIX,
  STEP_UP_FRESH_MS,
  buildStepUpMessage,
  payoutAction,
  tallyTransferAction,
  sendMoneyAction,
  onrampChargeAction,
} from '@/lib/step-up-shared';

describe('step-up-shared — constants', () => {
  it('STEP_UP_PREFIX is the fixed wallet-prompt header', () => {
    expect(STEP_UP_PREFIX).toBe('Visby security check');
  });

  it('STEP_UP_FRESH_MS is 5 minutes', () => {
    expect(STEP_UP_FRESH_MS).toBe(5 * 60 * 1000);
  });
});

describe('step-up-shared — buildStepUpMessage', () => {
  it('is deterministic for the same inputs', () => {
    const a = buildStepUpMessage('payout_destination:bank:connect', 'nonce-1', 1000);
    const b = buildStepUpMessage('payout_destination:bank:connect', 'nonce-1', 1000);
    expect(a).toBe(b);
  });

  it('embeds the action, nonce, and timestamp in a human-readable format', () => {
    const msg = buildStepUpMessage('send_money:USDC:abc123', 'xyz-nonce', 1700000000000);
    expect(msg).toBe(
      'Visby security check\naction: send_money:USDC:abc123\nts: 1700000000000\nnonce: xyz-nonce'
    );
  });

  it('different nonces produce different messages for the same action/ts', () => {
    const a = buildStepUpMessage('action-x', 'nonce-a', 1000);
    const b = buildStepUpMessage('action-x', 'nonce-b', 1000);
    expect(a).not.toBe(b);
  });

  it('different timestamps produce different messages for the same action/nonce', () => {
    const a = buildStepUpMessage('action-x', 'nonce-a', 1000);
    const b = buildStepUpMessage('action-x', 'nonce-a', 2000);
    expect(a).not.toBe(b);
  });

  it('different actions produce different messages for the same nonce/ts', () => {
    const a = buildStepUpMessage('action-x', 'nonce-a', 1000);
    const b = buildStepUpMessage('action-y', 'nonce-a', 1000);
    expect(a).not.toBe(b);
  });
});

describe('step-up-shared — action builders are deterministic', () => {
  it('payoutAction: same inputs → same string', () => {
    expect(payoutAction('bank', 'connect')).toBe(payoutAction('bank', 'connect'));
  });

  it('tallyTransferAction: same inputs → same string', () => {
    expect(tallyTransferAction('item-1', 'wallet-a')).toBe(tallyTransferAction('item-1', 'wallet-a'));
  });

  it('sendMoneyAction: same inputs → same string', () => {
    expect(sendMoneyAction('wallet-a', 'USDC')).toBe(sendMoneyAction('wallet-a', 'USDC'));
  });

  it('onrampChargeAction: same inputs → same string', () => {
    expect(onrampChargeAction('wallet-a', 100, 'USDC')).toBe(onrampChargeAction('wallet-a', 100, 'USDC'));
  });
});

describe('step-up-shared — action builders bind their exact inputs (format)', () => {
  it('payoutAction embeds payoutType and destination', () => {
    expect(payoutAction('bank', 'connect')).toBe('payout_destination:bank:connect');
    expect(payoutAction('crypto', 'SoLWaLLeT111')).toBe('payout_destination:crypto:SoLWaLLeT111');
  });

  it('payoutAction defaults an empty/falsy destination to empty string (does not throw or omit the field)', () => {
    expect(payoutAction('bank', '')).toBe('payout_destination:bank:');
  });

  it('tallyTransferAction embeds itemId and toWallet', () => {
    expect(tallyTransferAction('item-42', 'wallet-b')).toBe('transfer_tally:item-42:wallet-b');
  });

  it('sendMoneyAction embeds token and toWallet (token first)', () => {
    expect(sendMoneyAction('wallet-c', 'SOL')).toBe('send_money:SOL:wallet-c');
  });

  it('onrampChargeAction embeds asset, usd, and wallet', () => {
    expect(onrampChargeAction('wallet-d', 250, 'USDC')).toBe('onramp_charge:USDC:250:wallet-d');
  });
});

describe('step-up-shared — different logical actions never collide (realistic inputs)', () => {
  // Realistic inputs never contain the ':' delimiter: payout types are 'bank'/'crypto', wallet
  // addresses are base58, and asset/token symbols are short alnum strings (see call sites in
  // src/app/api/payout/route.ts, src/app/api/tally/transfer/route.ts,
  // src/app/api/transfer/prepare/route.ts, src/app/api/onramp/charge-saved/route.ts).

  it('different action kinds never collide, even with identical field values', () => {
    const shared = 'wallet-shared';
    const actions = [
      payoutAction('bank', shared),
      tallyTransferAction('item-x', shared),
      sendMoneyAction(shared, 'USDC'),
      onrampChargeAction(shared, 100, 'USDC'),
    ];
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('payoutAction: different destinations never collide', () => {
    expect(payoutAction('bank', 'connect')).not.toBe(payoutAction('crypto', 'connect'));
    expect(payoutAction('bank', 'wallet-a')).not.toBe(payoutAction('bank', 'wallet-b'));
  });

  it('tallyTransferAction: different items or destinations never collide', () => {
    expect(tallyTransferAction('item-1', 'wallet-a')).not.toBe(tallyTransferAction('item-2', 'wallet-a'));
    expect(tallyTransferAction('item-1', 'wallet-a')).not.toBe(tallyTransferAction('item-1', 'wallet-b'));
  });

  it('sendMoneyAction: different tokens or destinations never collide', () => {
    expect(sendMoneyAction('wallet-a', 'SOL')).not.toBe(sendMoneyAction('wallet-a', 'USDC'));
    expect(sendMoneyAction('wallet-a', 'SOL')).not.toBe(sendMoneyAction('wallet-b', 'SOL'));
  });

  it('onrampChargeAction: different amounts, assets, or wallets never collide', () => {
    expect(onrampChargeAction('wallet-a', 100, 'USDC')).not.toBe(onrampChargeAction('wallet-a', 200, 'USDC'));
    expect(onrampChargeAction('wallet-a', 100, 'USDC')).not.toBe(onrampChargeAction('wallet-a', 100, 'SOL'));
    expect(onrampChargeAction('wallet-a', 100, 'USDC')).not.toBe(onrampChargeAction('wallet-b', 100, 'USDC'));
  });

  it('onrampChargeAction: replaying a proof for a different amount on the same wallet/asset produces a different action string', () => {
    // Guards the off-session-charge replay scenario called out in the source comment.
    const a = onrampChargeAction('wallet-a', 50, 'USDC');
    const b = onrampChargeAction('wallet-a', 5000, 'USDC');
    expect(a).not.toBe(b);
  });
});

describe('step-up-shared — KNOWN LIMITATION: the ":" join has no escaping', () => {
  // Documents actual behavior rather than asserting a guarantee the implementation doesn't provide.
  // If a field value itself contains ':', two logically-different calls can produce the SAME action
  // string. This does not happen with real call-site inputs (see above), but the builders do not
  // defend against it structurally.
  it('payoutAction: a colon inside a field can shift the field boundary and collide with a different call', () => {
    const a = payoutAction('a:b', 'c');
    const b = payoutAction('a', 'b:c');
    expect(a).toBe(b); // both produce 'payout_destination:a:b:c' — documents the gap, not a guarantee
  });
});

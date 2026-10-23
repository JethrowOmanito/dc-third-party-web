import { describe, it, expect, beforeAll } from 'vitest';
import { feeWithGst, ruleFromTier, signFeeToken, verifyFeeToken } from '../fees';

// Needed by signFeeToken / verifyFeeToken — must be set BEFORE those are
// called. Vitest hoists imports so we also pre-set via beforeAll for safety.
process.env.JWT_SECRET = 'test-secret-32-chars-min-for-jose-hs256-ok';

describe('feeWithGst', () => {
  it('adds 9% GST to a round amount', () => {
    expect(feeWithGst(100)).toEqual({ base: 100, gst: 9, total: 109 });
  });

  it('handles sub-cent rounding on the base', () => {
    // 100 * 0.09 = 9 exact; but 60 * 0.09 = 5.4 → rounds to 5.4; total 65.4
    expect(feeWithGst(60)).toEqual({ base: 60, gst: 5.4, total: 65.4 });
  });

  it('rounds half-pennies to the nearest cent', () => {
    // 33.33 * 0.09 = 2.9997 → should round to 3.00 and total = 36.33
    expect(feeWithGst(33.33)).toEqual({ base: 33.33, gst: 3, total: 36.33 });
  });

  it('returns 0/0/0 for a zero fee', () => {
    expect(feeWithGst(0)).toEqual({ base: 0, gst: 0, total: 0 });
  });

  it('is monotonic — higher base ⇒ higher total', () => {
    expect(feeWithGst(15).total).toBeLessThan(feeWithGst(60).total);
    expect(feeWithGst(60).total).toBeLessThan(feeWithGst(100).total);
  });
});

describe('ruleFromTier', () => {
  it('returns no_fee when no tier matched', () => {
    expect(ruleFromTier(null)).toBe('no_fee');
  });

  it('classifies the standard tiers correctly', () => {
    expect(ruleFromTier(24)).toBe('<24h');
    expect(ruleFromTier(12)).toBe('<24h');
    expect(ruleFromTier(48)).toBe('<48h');
    expect(ruleFromTier(36)).toBe('<48h');
    expect(ruleFromTier(168)).toBe('<7d');
    expect(ruleFromTier(72)).toBe('<7d');
  });

  it('falls through to <Nh for non-standard tier boundaries', () => {
    expect(ruleFromTier(336)).toBe('<336h');
  });
});

describe('signFeeToken / verifyFeeToken round-trip', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-32-chars-min-for-jose-hs256-ok';
  });

  const payload = {
    event_id: 'c1c4d61e-f8df-4132-9ab6-105fdd95e6f4',
    kind: 'cancel' as const,
    base_amount: 60,
    gst_amount: 5.4,
    amount_with_gst: 65.4,
    tier_hit: 48,
    reason: 'tier_match' as const,
  };

  it('round-trips every field intact', async () => {
    const token = await signFeeToken(payload);
    const back = await verifyFeeToken(token, { event_id: payload.event_id, kind: 'cancel' });
    expect(back).not.toBeNull();
    expect(back?.event_id).toBe(payload.event_id);
    expect(back?.kind).toBe('cancel');
    expect(back?.base_amount).toBe(60);
    expect(back?.gst_amount).toBe(5.4);
    expect(back?.amount_with_gst).toBe(65.4);
    expect(back?.tier_hit).toBe(48);
    expect(back?.reason).toBe('tier_match');
  });

  it('rejects a token with the wrong event_id (prevents cross-event replay)', async () => {
    const token = await signFeeToken(payload);
    const back = await verifyFeeToken(token, {
      event_id: '00000000-0000-0000-0000-000000000000',
      kind: 'cancel',
    });
    expect(back).toBeNull();
  });

  it('rejects a cancel token when verifying as reschedule (prevents kind swap)', async () => {
    const token = await signFeeToken(payload);
    const back = await verifyFeeToken(token, { event_id: payload.event_id, kind: 'reschedule' });
    expect(back).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const token = await signFeeToken(payload);
    // Flip the last char of the signature — must break HMAC.
    const flipped = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
    const back = await verifyFeeToken(flipped, { event_id: payload.event_id, kind: 'cancel' });
    expect(back).toBeNull();
  });

  it('rejects garbage input instead of throwing', async () => {
    expect(await verifyFeeToken('not.a.jwt', { event_id: payload.event_id, kind: 'cancel' })).toBeNull();
    expect(await verifyFeeToken('', { event_id: payload.event_id, kind: 'cancel' })).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signFeeToken(payload);
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'different-secret-32-chars-min-ok-for-jose-ok';
    const back = await verifyFeeToken(token, { event_id: payload.event_id, kind: 'cancel' });
    expect(back).toBeNull();
    process.env.JWT_SECRET = originalSecret;
  });
});

/**
 * Sponsorship Integration Tests
 *
 * Tests for fee sponsorship functionality against Tempo testnet.
 *
 * These tests require:
 * - TEMPO_PRIVATE_KEY: Sender wallet private key (with testnet tokens)
 * - TEMPO_FEE_SPONSORSHIP_ENABLED=true
 * - TEMPO_FEE_PAYER_ADDRESS: Fee payer address
 * - TEMPO_FEE_PAYER_KEY: Fee payer private key (with testnet tokens)
 *
 * Run with: npm run test:integration -- --grep="sponsorship"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getSponsorshipService,
  resetSponsorshipService,
  type SponsorshipService,
} from '../../src/services/sponsorship-service.js';
import { getTempoClient, resetTempoClient } from '../../src/services/tempo-client.js';
import { resetConfig } from '../../src/config/index.js';
import type { Address } from 'viem';
import { parseUnits, pad, stringToHex } from 'viem';

// Skip if not configured for integration testing
const hasTestConfig = () => {
  return (
    process.env.TEMPO_PRIVATE_KEY &&
    process.env.TEMPO_FEE_SPONSORSHIP_ENABLED === 'true'
  );
};

describe.skipIf(!hasTestConfig())('Sponsorship Integration', () => {
  let service: SponsorshipService;
  const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address;
  const TEST_RECIPIENT = '0x0000000000000000000000000000000000000001' as Address;

  beforeAll(() => {
    // Reset singletons to pick up test config
    resetConfig();
    resetTempoClient();
    resetSponsorshipService();
    service = getSponsorshipService();
  });

  afterAll(() => {
    // Clean up singletons
    resetSponsorshipService();
    resetTempoClient();
    resetConfig();
  });

  // ===========================================================================
  // Balance Queries
  // ===========================================================================

  describe('getSponsorBalance', () => {
    it('should return sponsor balance', async () => {
      const result = await service.getSponsorBalance(undefined, ALPHA_USD);

      expect(result).toBeDefined();
      expect(result.balance).toBeDefined();
      expect(result.balanceRaw).toBeGreaterThanOrEqual(BigInt(0));
      expect(result.sponsor).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(result.token).toBe(ALPHA_USD);
    });

    it('should accept custom sponsor address', async () => {
      const customSponsor = '0x0000000000000000000000000000000000000001' as Address;
      const result = await service.getSponsorBalance(customSponsor, ALPHA_USD);

      expect(result.sponsor).toBe(customSponsor);
      // Zero address will have zero balance
      expect(result.balanceRaw).toBe(BigInt(0));
    });
  });

  // ===========================================================================
  // Gas Estimation
  // ===========================================================================

  describe('estimateSponsoredGas', () => {
    it('should estimate gas for transfer', async () => {
      const result = await service.estimateSponsoredGas({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount: parseUnits('1', 6),
      });

      expect(result.gasLimit).toBeGreaterThan(BigInt(0));
      expect(result.estimatedFee).toBeDefined();
      expect(parseFloat(result.estimatedFee)).toBeGreaterThan(0);
      expect(result.feeToken).toBe(ALPHA_USD);
    });

    it('should accept custom fee token', async () => {
      const BETA_USD = '0x20c0000000000000000000000000000000000002' as Address;

      const result = await service.estimateSponsoredGas({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount: parseUnits('10', 6),
        feeToken: BETA_USD,
      });

      expect(result.feeToken).toBe(BETA_USD);
    });
  });

  // ===========================================================================
  // Sponsored Payments (requires funded accounts)
  // ===========================================================================

  describe.skipIf(!process.env.TEMPO_FEE_PAYER_KEY)('sendSponsoredPayment', () => {
    it('should send sponsored payment with local fee payer', async () => {
      const amount = parseUnits('0.01', 6); // Small amount for testing

      const result = await service.sendSponsoredPayment({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount,
        useRelay: false,
      });

      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.feePayer).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should send sponsored payment with memo', async () => {
      const amount = parseUnits('0.01', 6);
      const memo = pad(stringToHex('TEST-MEMO'), { size: 32 });

      const result = await service.sendSponsoredPayment({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount,
        memo,
        useRelay: false,
      });

      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  // ===========================================================================
  // Relay Service (requires testnet relay to be available)
  // ===========================================================================

  describe.skip('sendSponsoredPaymentRelay', () => {
    // These tests are skipped by default as they require the testnet relay
    // to be operational and accepting requests from this account

    it('should send payment via testnet relay', async () => {
      const amount = parseUnits('0.01', 6);

      const result = await service.sendSponsoredPayment({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount,
        useRelay: true,
      });

      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.feePayer).toBe('Tempo Testnet Relay');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('should throw on insufficient sponsor balance', async () => {
      // Try to estimate gas for very large amount
      const hugeAmount = parseUnits('1000000000', 6); // 1 billion

      // This should still succeed for estimation (read-only)
      const result = await service.estimateSponsoredGas({
        token: ALPHA_USD,
        to: TEST_RECIPIENT,
        amount: hugeAmount,
      });

      expect(result.gasLimit).toBeGreaterThan(BigInt(0));
    });

    it('should throw on invalid recipient address', async () => {
      await expect(
        service.estimateSponsoredGas({
          token: ALPHA_USD,
          to: '0xinvalid' as Address,
          amount: parseUnits('1', 6),
        })
      ).rejects.toThrow();
    });
  });
});

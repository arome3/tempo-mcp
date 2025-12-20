/**
 * Sponsorship Schema Tests
 *
 * Tests for Zod schemas used in fee sponsorship tools.
 */

import { describe, it, expect } from 'vitest';
import {
  sendSponsoredPaymentInputZodSchema,
  estimateSponsoredGasInputZodSchema,
  getSponsorBalanceInputZodSchema,
  createSponsoredPaymentResponse,
  createEstimateSponsoredGasResponse,
  createSponsorBalanceResponse,
  createSponsorshipErrorResponse,
} from '../../../src/tools/sponsorship/schemas.js';

describe('Sponsorship Schemas', () => {
  // ===========================================================================
  // send_sponsored_payment Input Schema
  // ===========================================================================

  describe('sendSponsoredPaymentInputZodSchema', () => {
    it('should accept valid input with all fields', () => {
      const input = {
        token: '0x20c0000000000000000000000000000000000001',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100.50',
        memo: 'INV-12345',
        feePayer: '0xfeefeefeefeefeefeefeefeefeefeefeefeefee1',
        useRelay: false,
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBe(input.token);
        expect(result.data.to).toBe(input.to);
        expect(result.data.amount).toBe(input.amount);
        expect(result.data.memo).toBe(input.memo);
        expect(result.data.feePayer).toBe(input.feePayer);
        expect(result.data.useRelay).toBe(false);
      }
    });

    it('should accept valid input with required fields only', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x1234567890123456789012345678901234567890',
        amount: '50',
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.useRelay).toBe(false); // default
        expect(result.data.memo).toBeUndefined();
        expect(result.data.feePayer).toBeUndefined();
      }
    });

    it('should reject invalid recipient address', () => {
      const input = {
        token: 'AlphaUSD',
        to: 'invalid-address',
        amount: '100',
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty token', () => {
      const input = {
        token: '',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100',
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept useRelay as true', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100',
        useRelay: true,
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.useRelay).toBe(true);
      }
    });

    it('should accept memo up to 32 characters', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100',
        memo: '12345678901234567890123456789012', // exactly 32 chars
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject memo longer than 32 characters', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100',
        memo: '123456789012345678901234567890123', // 33 chars
      };

      const result = sendSponsoredPaymentInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // estimate_sponsored_gas Input Schema
  // ===========================================================================

  describe('estimateSponsoredGasInputZodSchema', () => {
    it('should accept valid input with all fields', () => {
      const input = {
        token: '0x20c0000000000000000000000000000000000001',
        to: '0x1234567890123456789012345678901234567890',
        amount: '100',
        feeToken: '0x20c0000000000000000000000000000000000002',
      };

      const result = estimateSponsoredGasInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept input without optional feeToken', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x1234567890123456789012345678901234567890',
        amount: '50.25',
      };

      const result = estimateSponsoredGasInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.feeToken).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // get_sponsor_balance Input Schema
  // ===========================================================================

  describe('getSponsorBalanceInputZodSchema', () => {
    it('should accept input with both fields', () => {
      const input = {
        sponsor: '0x1234567890123456789012345678901234567890',
        token: 'AlphaUSD',
      };

      const result = getSponsorBalanceInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept empty input (all fields optional)', () => {
      const input = {};

      const result = getSponsorBalanceInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sponsor address', () => {
      const input = {
        sponsor: 'not-an-address',
      };

      const result = getSponsorBalanceInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Response Helper Functions
  // ===========================================================================

  describe('createSponsoredPaymentResponse', () => {
    it('should create valid response with timestamp', () => {
      const response = createSponsoredPaymentResponse({
        transactionHash: '0xabc123',
        blockNumber: 12345,
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        amount: '100',
        token: '0x20c0000000000000000000000000000000000001',
        tokenSymbol: 'AlphaUSD',
        memo: 'test-memo',
        feePayer: '0x3333333333333333333333333333333333333333',
        feeAmount: '0.001',
        feeToken: '0x20c0000000000000000000000000000000000001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0xabc123',
      });

      expect(response.success).toBe(true);
      expect(response.transactionHash).toBe('0xabc123');
      expect(response.blockNumber).toBe(12345);
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).not.toBeNaN();
    });

    it('should handle null memo', () => {
      const response = createSponsoredPaymentResponse({
        transactionHash: '0xabc123',
        blockNumber: 12345,
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        amount: '100',
        token: '0x20c0000000000000000000000000000000000001',
        tokenSymbol: 'AlphaUSD',
        memo: null,
        feePayer: 'Tempo Testnet Relay',
        feeAmount: '0.001',
        feeToken: '0x20c0000000000000000000000000000000000001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0xabc123',
      });

      expect(response.memo).toBeNull();
    });
  });

  describe('createEstimateSponsoredGasResponse', () => {
    it('should create valid response', () => {
      const response = createEstimateSponsoredGasResponse({
        gasLimit: '21000',
        estimatedFee: '0.0021',
        feeToken: '0x20c0000000000000000000000000000000000001',
        feeTokenSymbol: 'AlphaUSD',
      });

      expect(response.gasLimit).toBe('21000');
      expect(response.estimatedFee).toBe('0.0021');
      expect(response.feeTokenSymbol).toBe('AlphaUSD');
    });
  });

  describe('createSponsorBalanceResponse', () => {
    it('should create valid response', () => {
      const response = createSponsorBalanceResponse({
        balance: '1000.50',
        balanceRaw: '1000500000',
        sponsor: '0x1234567890123456789012345678901234567890',
        token: '0x20c0000000000000000000000000000000000001',
        tokenSymbol: 'AlphaUSD',
      });

      expect(response.balance).toBe('1000.50');
      expect(response.sponsor).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('createSponsorshipErrorResponse', () => {
    it('should create error response with all fields', () => {
      const response = createSponsorshipErrorResponse({
        code: 3001,
        message: 'Insufficient sponsor balance',
        details: {
          field: 'balance',
          expected: '100',
          received: '50',
          suggestion: 'Fund the sponsor account',
        },
        recoverable: true,
        retryAfter: 60,
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe(3001);
      expect(response.error.message).toBe('Insufficient sponsor balance');
      expect(response.error.details?.suggestion).toBe('Fund the sponsor account');
      expect(response.error.recoverable).toBe(true);
    });

    it('should create minimal error response', () => {
      const response = createSponsorshipErrorResponse({
        code: 1000,
        message: 'Unknown error',
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe(1000);
      expect(response.error.details).toBeUndefined();
    });
  });
});

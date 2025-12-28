/**
 * Payment Tool Schema Tests
 *
 * Validates input/output schemas for payment tools:
 * - send_payment input validation
 * - send_payment output structure
 * - Error response structure
 * - Helper function behavior
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  sendPaymentInputZodSchema,
  sendPaymentOutputSchema,
  sendPaymentErrorSchema,
  validateSendPaymentInput,
  safeParseSendPaymentInput,
  createSuccessResponse,
  createErrorResponse,
  type SendPaymentInput,
  type SendPaymentOutput,
  type SendPaymentError,
} from '../../../src/tools/payments/schemas.js';

describe('Payment Schemas', () => {
  // ===========================================================================
  // Input Schema Validation
  // ===========================================================================

  describe('sendPaymentInputSchema', () => {
    describe('token field', () => {
      it('should accept token symbol', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept token address', () => {
        const input = {
          token: '0x20c0000000000000000000000000000000000001',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject empty token', () => {
        const input = {
          token: '',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    describe('to field (recipient address)', () => {
      it('should accept valid 0x address', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x1234567890123456789012345678901234567890',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept lowercase address', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0xabcdef1234567890abcdef1234567890abcdef12',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept uppercase address', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept mixed case address', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject address without 0x prefix', () => {
        const input = {
          token: 'AlphaUSD',
          to: 'abcdef1234567890abcdef1234567890abcdef12',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject address with wrong length (too short)', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x1234567890',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject address with wrong length (too long)', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(42),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject address with invalid characters', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0xGGGGGG1234567890abcdef1234567890abcdef12',
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    describe('amount field', () => {
      it('should accept integer amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept decimal amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100.50',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept amount with many decimals', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100.123456',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept zero amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '0',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept large amounts', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '1000000000000',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject negative amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '-100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject non-numeric amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: 'abc',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject empty amount', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject amount with leading decimal', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '.50',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    describe('memo field (optional)', () => {
      it('should accept valid memo', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
          memo: 'INV-2024-001',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept empty input without memo', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept memo at max length (32 chars)', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
          memo: 'a'.repeat(32),
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject memo exceeding max length', () => {
        const input = {
          token: 'AlphaUSD',
          to: '0x' + 'a'.repeat(40),
          amount: '100',
          memo: 'a'.repeat(33),
        };

        const result = sendPaymentInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Output Schema Validation
  // ===========================================================================

  describe('sendPaymentOutputSchema', () => {
    it('should validate complete success response', () => {
      const output: SendPaymentOutput = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        from: '0x' + 'a'.repeat(40),
        to: '0x' + 'b'.repeat(40),
        amount: '100.50',
        amountRaw: '100500000',
        token: '0x' + 'c'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        memo: 'INV-001',
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = sendPaymentOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate response with null memo', () => {
      const output: SendPaymentOutput = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        from: '0x' + 'a'.repeat(40),
        to: '0x' + 'b'.repeat(40),
        amount: '100.50',
        amountRaw: '100500000',
        token: '0x' + 'c'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = sendPaymentOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const output = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        // missing other required fields
      };

      const result = sendPaymentOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Error Schema Validation
  // ===========================================================================

  describe('sendPaymentErrorSchema', () => {
    it('should validate error response', () => {
      const error: SendPaymentError = {
        success: false,
        error: {
          code: 1001,
          message: 'Invalid address',
          details: {
            field: 'to',
            expected: 'valid 0x address',
            received: 'invalid',
          },
          recoverable: false,
        },
      };

      const result = sendPaymentErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });

    it('should validate minimal error response', () => {
      const error: SendPaymentError = {
        success: false,
        error: {
          code: 1001,
          message: 'Error occurred',
        },
      };

      const result = sendPaymentErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });

    it('should validate error with retryAfter', () => {
      const error: SendPaymentError = {
        success: false,
        error: {
          code: 4001,
          message: 'Rate limit exceeded',
          recoverable: true,
          retryAfter: 60,
        },
      };

      const result = sendPaymentErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Helper Function Tests
  // ===========================================================================

  describe('validateSendPaymentInput', () => {
    it('should return validated input for valid data', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '100',
      };

      const result = validateSendPaymentInput(input);

      expect(result.token).toBe('AlphaUSD');
      expect(result.to).toBe('0x' + 'a'.repeat(40));
      expect(result.amount).toBe('100');
    });

    it('should throw ZodError for invalid data', () => {
      const input = {
        token: '',
        to: 'invalid',
        amount: '-100',
      };

      expect(() => validateSendPaymentInput(input)).toThrow(z.ZodError);
    });
  });

  describe('safeParseSendPaymentInput', () => {
    it('should return success for valid input', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '100',
      };

      const result = safeParseSendPaymentInput(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBe('AlphaUSD');
      }
    });

    it('should return error for invalid input', () => {
      const input = {
        token: '',
        to: 'invalid',
        amount: '-100',
      };

      const result = safeParseSendPaymentInput(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with timestamp', () => {
      const data = {
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        from: '0x' + 'a'.repeat(40),
        to: '0x' + 'b'.repeat(40),
        amount: '100',
        amountRaw: '100000000',
        token: '0x' + 'c'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
      };

      const result = createSuccessResponse(data);

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response', () => {
      const error = {
        code: 1001,
        message: 'Test error',
      };

      const result = createErrorResponse(error);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(1001);
      expect(result.error.message).toBe('Test error');
    });

    it('should include optional fields', () => {
      const error = {
        code: 1001,
        message: 'Test error',
        details: { field: 'test' },
        recoverable: true,
        retryAfter: 30,
      };

      const result = createErrorResponse(error);

      expect(result.error.details).toEqual({ field: 'test' });
      expect(result.error.recoverable).toBe(true);
      expect(result.error.retryAfter).toBe(30);
    });
  });
});

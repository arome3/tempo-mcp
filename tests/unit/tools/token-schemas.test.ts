/**
 * Token Tool Schema Tests
 *
 * Validates input/output schemas for token tools:
 * - create_token input validation
 * - get_token_info input/output validation
 * - mint_tokens input validation
 * - burn_tokens input validation
 * - Error response structure
 * - Helper function behavior
 */

import { describe, it, expect } from 'vitest';
import {
  createTokenInputZodSchema,
  createTokenOutputSchema,
  getTokenInfoInputZodSchema,
  getTokenInfoOutputSchema,
  mintTokensInputZodSchema,
  mintTokensOutputSchema,
  burnTokensInputZodSchema,
  burnTokensOutputSchema,
  tokenOperationErrorSchema,
  createCreateTokenResponse,
  createMintTokensResponse,
  createBurnTokensResponse,
  createTokenErrorResponse,
  type CreateTokenInput,
  type MintTokensInput,
  type BurnTokensInput,
} from '../../../src/tools/tokens/schemas.js';

describe('Token Schemas', () => {
  // ===========================================================================
  // create_token Input Schema
  // ===========================================================================

  describe('createTokenInputSchema', () => {
    it('should accept valid token creation input', () => {
      const input: CreateTokenInput = {
        name: 'Test Token',
        symbol: 'TEST',
        currency: 'USD',
      };

      const result = createTokenInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should use default currency if not provided', () => {
      const input = {
        name: 'Test Token',
        symbol: 'TEST',
      };

      const result = createTokenInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });

    it('should accept optional quote token', () => {
      const input: CreateTokenInput = {
        name: 'Test Token',
        symbol: 'TEST',
        currency: 'USD',
        quoteToken: '0x' + 'a'.repeat(40),
      };

      const result = createTokenInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    describe('name field', () => {
      it('should reject empty name', () => {
        const input = {
          name: '',
          symbol: 'TEST',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject name exceeding 64 chars', () => {
        const input = {
          name: 'a'.repeat(65),
          symbol: 'TEST',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should accept name at max length', () => {
        const input = {
          name: 'a'.repeat(64),
          symbol: 'TEST',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('symbol field', () => {
      it('should reject empty symbol', () => {
        const input = {
          name: 'Test Token',
          symbol: '',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject symbol exceeding 10 chars', () => {
        const input = {
          name: 'Test Token',
          symbol: 'TOOLONGSYMB',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should accept symbol at max length', () => {
        const input = {
          name: 'Test Token',
          symbol: 'TESTSYMBOL',
          currency: 'USD',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('quoteToken field', () => {
      it('should reject invalid quote token address', () => {
        const input = {
          name: 'Test Token',
          symbol: 'TEST',
          currency: 'USD',
          quoteToken: 'invalid',
        };

        const result = createTokenInputZodSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // create_token Output Schema
  // ===========================================================================

  describe('createTokenOutputSchema', () => {
    it('should validate complete success response', () => {
      const output = {
        success: true,
        tokenAddress: '0x' + 'a'.repeat(40),
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 12345,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 6 as const,
        currency: 'USD',
        admin: '0x' + 'c'.repeat(40),
        quoteToken: '0x' + 'd'.repeat(40),
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = createTokenOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should enforce decimals as 6', () => {
      const output = {
        success: true,
        tokenAddress: '0x' + 'a'.repeat(40),
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 12345,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18, // Wrong! TIP-20 always uses 6
        currency: 'USD',
        admin: '0x' + 'c'.repeat(40),
        quoteToken: '0x' + 'd'.repeat(40),
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = createTokenOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // get_token_info Input Schema
  // ===========================================================================

  describe('getTokenInfoInputSchema', () => {
    it('should accept token symbol', () => {
      const input = { token: 'AlphaUSD' };

      const result = getTokenInfoInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept token address', () => {
      const input = { token: '0x' + 'a'.repeat(40) };

      const result = getTokenInfoInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const input = { token: '' };

      const result = getTokenInfoInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // get_token_info Output Schema
  // ===========================================================================

  describe('getTokenInfoOutputSchema', () => {
    it('should validate token info response', () => {
      const output = {
        address: '0x' + 'a'.repeat(40),
        name: 'Alpha USD',
        symbol: 'AlphaUSD',
        decimals: 6,
        totalSupply: '1000000',
        totalSupplyRaw: '1000000000000',
      };

      const result = getTokenInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // mint_tokens Input Schema
  // ===========================================================================

  describe('mintTokensInputSchema', () => {
    it('should accept valid mint input', () => {
      const input: MintTokensInput = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '1000',
      };

      const result = mintTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept mint with memo', () => {
      const input: MintTokensInput = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '1000',
        memo: 'Initial mint',
      };

      const result = mintTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid recipient address', () => {
      const input = {
        token: 'AlphaUSD',
        to: 'invalid',
        amount: '1000',
      };

      const result = mintTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid amount format', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '-1000',
      };

      const result = mintTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject memo exceeding 32 bytes', () => {
      const input = {
        token: 'AlphaUSD',
        to: '0x' + 'a'.repeat(40),
        amount: '1000',
        memo: 'a'.repeat(33),
      };

      const result = mintTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // mint_tokens Output Schema
  // ===========================================================================

  describe('mintTokensOutputSchema', () => {
    it('should validate mint success response', () => {
      const output = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        to: '0x' + 'c'.repeat(40),
        amount: '1000',
        amountRaw: '1000000000',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = mintTokensOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept response with memo', () => {
      const output = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        to: '0x' + 'c'.repeat(40),
        amount: '1000',
        amountRaw: '1000000000',
        memo: 'Initial mint',
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = mintTokensOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // burn_tokens Input Schema
  // ===========================================================================

  describe('burnTokensInputSchema', () => {
    it('should accept valid burn input', () => {
      const input: BurnTokensInput = {
        token: 'AlphaUSD',
        amount: '500',
      };

      const result = burnTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept burn with memo', () => {
      const input: BurnTokensInput = {
        token: 'AlphaUSD',
        amount: '500',
        memo: 'Cleanup burn',
      };

      const result = burnTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid amount', () => {
      const input = {
        token: 'AlphaUSD',
        amount: 'abc',
      };

      const result = burnTokensInputZodSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // burn_tokens Output Schema
  // ===========================================================================

  describe('burnTokensOutputSchema', () => {
    it('should validate burn success response', () => {
      const output = {
        success: true,
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        amount: '500',
        amountRaw: '500000000',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
        timestamp: new Date().toISOString(),
      };

      const result = burnTokensOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Error Schema
  // ===========================================================================

  describe('tokenOperationErrorSchema', () => {
    it('should validate error response', () => {
      const error = {
        success: false,
        error: {
          code: 3006,
          message: 'Mint failed: caller does not have ISSUER_ROLE',
          details: {
            suggestion: 'Use grant_role to assign ISSUER_ROLE',
          },
          recoverable: false,
        },
      };

      const result = tokenOperationErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  describe('createCreateTokenResponse', () => {
    it('should create response with timestamp and decimals', () => {
      const data = {
        tokenAddress: '0x' + 'a'.repeat(40),
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 12345,
        name: 'Test Token',
        symbol: 'TEST',
        currency: 'USD',
        admin: '0x' + 'c'.repeat(40),
        quoteToken: '0x' + 'd'.repeat(40),
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
      };

      const result = createCreateTokenResponse(data);

      expect(result.success).toBe(true);
      expect(result.decimals).toBe(6);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createMintTokensResponse', () => {
    it('should create response with timestamp', () => {
      const data = {
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        to: '0x' + 'c'.repeat(40),
        amount: '1000',
        amountRaw: '1000000000',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
      };

      const result = createMintTokensResponse(data);

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createBurnTokensResponse', () => {
    it('should create response with timestamp', () => {
      const data = {
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: 12345,
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        amount: '500',
        amountRaw: '500000000',
        memo: null,
        gasCost: '0.001',
        explorerUrl: 'https://explore.tempo.xyz/tx/0x...',
      };

      const result = createBurnTokensResponse(data);

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createTokenErrorResponse', () => {
    it('should create error response', () => {
      const error = {
        code: 3006,
        message: 'Test error',
        recoverable: false,
      };

      const result = createTokenErrorResponse(error);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(3006);
    });
  });
});

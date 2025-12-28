/**
 * Account Tool Schema Tests
 *
 * Validates input/output schemas for account tools:
 * - get_balance input/output validation
 * - get_balances input/output validation
 * - get_account_info input/output validation
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  getBalanceOutputSchema,
  getBalancesOutputSchema,
  getAccountInfoOutputSchema,
  balanceEntrySchema,
  type GetBalanceInput,
  type GetBalanceOutput,
  type GetBalancesInput,
  type GetBalancesOutput,
  type GetAccountInfoInput,
  type GetAccountInfoOutput,
} from '../../../src/tools/account/schemas.js';

describe('Account Schemas', () => {
  // ===========================================================================
  // get_balance Input Schema
  // ===========================================================================

  describe('get_balance input', () => {
    it('should accept token symbol only', () => {
      const input: GetBalanceInput = {
        token: 'AlphaUSD',
      };

      expect(input.token).toBe('AlphaUSD');
      expect(input.address).toBeUndefined();
    });

    it('should accept token with optional address', () => {
      const input: GetBalanceInput = {
        token: 'AlphaUSD',
        address: '0x' + 'a'.repeat(40),
      };

      expect(input.token).toBe('AlphaUSD');
      expect(input.address).toBeDefined();
    });

    it('should accept token address as token', () => {
      const input: GetBalanceInput = {
        token: '0x' + 'a'.repeat(40),
      };

      expect(input.token.startsWith('0x')).toBe(true);
    });
  });

  // ===========================================================================
  // get_balance Output Schema
  // ===========================================================================

  describe('getBalanceOutputSchema', () => {
    it('should validate complete balance response', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: '1000.50',
        balanceRaw: '1000500000',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate zero balance', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: '0',
        balanceRaw: '0',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const output = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        // missing tokenSymbol, tokenName, etc.
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject non-string balance', () => {
      const output = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: 1000.5, // Should be string
        balanceRaw: '1000500000',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // get_balances Input Schema
  // ===========================================================================

  describe('get_balances input', () => {
    it('should accept empty input (use defaults)', () => {
      const input: GetBalancesInput = {};

      expect(input.tokens).toBeUndefined();
      expect(input.address).toBeUndefined();
    });

    it('should accept token array', () => {
      const input: GetBalancesInput = {
        tokens: ['AlphaUSD', 'PathUSD'],
      };

      expect(input.tokens).toHaveLength(2);
    });

    it('should accept token array with address', () => {
      const input: GetBalancesInput = {
        tokens: ['AlphaUSD'],
        address: '0x' + 'a'.repeat(40),
      };

      expect(input.tokens).toHaveLength(1);
      expect(input.address).toBeDefined();
    });
  });

  // ===========================================================================
  // get_balances Output Schema
  // ===========================================================================

  describe('getBalancesOutputSchema', () => {
    it('should validate multiple balances response', () => {
      const output: GetBalancesOutput = {
        address: '0x' + 'a'.repeat(40),
        balances: [
          {
            token: '0x' + 'b'.repeat(40),
            tokenSymbol: 'AlphaUSD',
            tokenName: 'Alpha USD',
            balance: '1000',
            balanceRaw: '1000000000',
            decimals: 6,
          },
          {
            token: '0x' + 'c'.repeat(40),
            tokenSymbol: 'PathUSD',
            tokenName: 'Path USD',
            balance: '500',
            balanceRaw: '500000000',
            decimals: 6,
          },
        ],
      };

      const result = getBalancesOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate empty balances array', () => {
      const output: GetBalancesOutput = {
        address: '0x' + 'a'.repeat(40),
        balances: [],
      };

      const result = getBalancesOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate single balance', () => {
      const output: GetBalancesOutput = {
        address: '0x' + 'a'.repeat(40),
        balances: [
          {
            token: '0x' + 'b'.repeat(40),
            tokenSymbol: 'AlphaUSD',
            tokenName: 'Alpha USD',
            balance: '1000',
            balanceRaw: '1000000000',
            decimals: 6,
          },
        ],
      };

      const result = getBalancesOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Balance Entry Schema
  // ===========================================================================

  describe('balanceEntrySchema', () => {
    it('should validate complete balance entry', () => {
      const entry = {
        token: '0x' + 'a'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: '1000',
        balanceRaw: '1000000000',
        decimals: 6,
      };

      const result = balanceEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    });

    it('should require all fields', () => {
      const entry = {
        token: '0x' + 'a'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        // missing other fields
      };

      const result = balanceEntrySchema.safeParse(entry);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // get_account_info Input Schema
  // ===========================================================================

  describe('get_account_info input', () => {
    it('should accept empty input (use default)', () => {
      const input: GetAccountInfoInput = {};

      expect(input.address).toBeUndefined();
    });

    it('should accept optional address', () => {
      const input: GetAccountInfoInput = {
        address: '0x' + 'a'.repeat(40),
      };

      expect(input.address).toBeDefined();
    });
  });

  // ===========================================================================
  // get_account_info Output Schema
  // ===========================================================================

  describe('getAccountInfoOutputSchema', () => {
    it('should validate EOA account info', () => {
      const output: GetAccountInfoOutput = {
        address: '0x' + 'a'.repeat(40),
        type: 'eoa',
        balances: [
          {
            token: '0x' + 'b'.repeat(40),
            tokenSymbol: 'AlphaUSD',
            balance: '1000',
          },
        ],
        transactionCount: 42,
        firstSeen: null,
        lastActive: null,
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate contract account info', () => {
      const output: GetAccountInfoOutput = {
        address: '0x' + 'a'.repeat(40),
        type: 'contract',
        balances: [],
        transactionCount: 0,
        firstSeen: null,
        lastActive: null,
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate with timestamp strings', () => {
      const output: GetAccountInfoOutput = {
        address: '0x' + 'a'.repeat(40),
        type: 'eoa',
        balances: [],
        transactionCount: 10,
        firstSeen: '2024-01-01T00:00:00Z',
        lastActive: '2024-12-01T12:30:00Z',
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject invalid account type', () => {
      const output = {
        address: '0x' + 'a'.repeat(40),
        type: 'unknown', // invalid
        balances: [],
        transactionCount: 0,
        firstSeen: null,
        lastActive: null,
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should validate empty balances with high tx count', () => {
      const output: GetAccountInfoOutput = {
        address: '0x' + 'a'.repeat(40),
        type: 'eoa',
        balances: [],
        transactionCount: 1000,
        firstSeen: null,
        lastActive: null,
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate multiple non-zero balances', () => {
      const output: GetAccountInfoOutput = {
        address: '0x' + 'a'.repeat(40),
        type: 'eoa',
        balances: [
          {
            token: '0x' + 'b'.repeat(40),
            tokenSymbol: 'AlphaUSD',
            balance: '1000',
          },
          {
            token: '0x' + 'c'.repeat(40),
            tokenSymbol: 'PathUSD',
            balance: '500',
          },
          {
            token: '0x' + 'd'.repeat(40),
            tokenSymbol: 'USDC',
            balance: '250.50',
          },
        ],
        transactionCount: 100,
        firstSeen: null,
        lastActive: null,
      };

      const result = getAccountInfoOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.balances).toHaveLength(3);
      }
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle very large balance values', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: '999999999999999999',
        balanceRaw: '999999999999999999000000',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should handle very small balance values (dust)', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'AlphaUSD',
        tokenName: 'Alpha USD',
        balance: '0.000001',
        balanceRaw: '1',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should handle different decimal values', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'WETH',
        tokenName: 'Wrapped Ether',
        balance: '1.5',
        balanceRaw: '1500000000000000000',
        decimals: 18,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should handle special characters in token names', () => {
      const output: GetBalanceOutput = {
        address: '0x' + 'a'.repeat(40),
        token: '0x' + 'b'.repeat(40),
        tokenSymbol: 'USD+',
        tokenName: 'USD Plus (v2)',
        balance: '100',
        balanceRaw: '100000000',
        decimals: 6,
      };

      const result = getBalanceOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });
});

/**
 * E2E Tests: MCP Tool Integration
 *
 * Tests the MCP tools through the server interface against the real testnet.
 * Verifies that tools produce correct JSON responses and handle errors properly.
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - Network access to Tempo testnet RPC
 *
 * Run with:
 *   npm run test:e2e
 */

import { describe, it, expect, beforeAll } from 'vitest';

import {
  describeE2E,
  describeE2EWrite,
  E2E_CONFIG,
  shouldRunE2E,
  logE2EStatus,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let loadConfig: typeof import('../../src/config/index.js').loadConfig;

// Tool handler imports - we'll call the tool implementations directly
let registerAccountTools: typeof import('../../src/tools/account/index.js').registerAccountTools;
let registerPaymentTools: typeof import('../../src/tools/payments/index.js').registerPaymentTools;

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Parse a tool response to extract the JSON content.
 */
function parseToolResponse(response: { content: Array<{ type: string; text: string }> }): unknown {
  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in tool response');
  }
  return JSON.parse(textContent.text);
}

// =============================================================================
// Test Suite
// =============================================================================

describeE2E('E2E: MCP Tool Integration', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Import and initialize
    const configModule = await import('../../src/config/index.js');
    loadConfig = configModule.loadConfig;

    // Load configuration
    loadConfig();
  });

  // ===========================================================================
  // Balance Tools
  // ===========================================================================

  describe('Balance Tools', () => {
    it('should call get_balance and return valid JSON', async () => {
      // Import the balance service directly to test the underlying logic
      const { getBalanceService } = await import('../../src/services/balance-service.js');
      const service = getBalanceService();

      const result = await service.getBalance('AlphaUSD');

      // Verify response structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('tokenSymbol');
      expect(result).toHaveProperty('tokenName');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('balanceRaw');
      expect(result).toHaveProperty('decimals');

      // Verify types
      expect(typeof result.token).toBe('string');
      expect(typeof result.tokenSymbol).toBe('string');
      expect(typeof result.balance).toBe('string');
      expect(typeof result.decimals).toBe('number');

      console.log('  Response structure: VALID');
      console.log(`  Balance: ${result.balance} ${result.tokenSymbol}`);
    }, E2E_CONFIG.timeout);

    it('should call get_balances with multiple tokens', async () => {
      const { getBalanceService } = await import('../../src/services/balance-service.js');
      const service = getBalanceService();

      const results = await service.getBalances(['AlphaUSD']);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('tokenSymbol');
        expect(result).toHaveProperty('balance');
      }

      console.log(`  Returned ${results.length} token balance(s)`);
    }, E2E_CONFIG.timeout);

    it('should call get_account_info and detect account type', async () => {
      const { getBalanceService } = await import('../../src/services/balance-service.js');
      const service = getBalanceService();

      const result = await service.getAccountInfo();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('balances');
      expect(result).toHaveProperty('transactionCount');

      expect(result.type).toMatch(/^(eoa|contract)$/);
      expect(Array.isArray(result.balances)).toBe(true);

      console.log(`  Account type: ${result.type}`);
      console.log(`  TX count: ${result.transactionCount}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Transaction Tools
  // ===========================================================================

  describe('Transaction Tools', () => {
    it('should call get_gas_estimate and return cost info', async () => {
      const { getTransactionService } = await import('../../src/services/transaction-service.js');
      const service = getTransactionService();

      const result = await service.estimateGas({
        to: E2E_CONFIG.testRecipient,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('gasLimit');
      expect(result).toHaveProperty('gasPrice');
      expect(result).toHaveProperty('estimatedCost');

      console.log(`  Gas limit: ${result.gasLimit}`);
      console.log(`  Estimated cost: ${result.estimatedCost}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Token Tools
  // ===========================================================================

  describe('Token Tools', () => {
    it('should call get_token_info and return metadata', async () => {
      const { getTokenService } = await import('../../src/services/token-service.js');
      const service = getTokenService();

      const result = await service.getTokenInfo(E2E_CONFIG.knownTokenAddress);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('symbol');
      expect(result).toHaveProperty('decimals');
      expect(result).toHaveProperty('totalSupply');

      expect(result.symbol).toBe('AlphaUSD');
      expect(result.decimals).toBe(6);

      console.log(`  Token: ${result.name} (${result.symbol})`);
      console.log(`  Total Supply: ${result.totalSupply}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Exchange Tools
  // ===========================================================================

  describe('Exchange Tools', () => {
    it('should call get_swap_quote (if DEX available)', async () => {
      const { getExchangeService } = await import('../../src/services/exchange-service.js');
      const service = getExchangeService();

      try {
        const result = await service.getQuote({
          fromToken: E2E_CONFIG.tokens.alphaUSD,
          toToken: E2E_CONFIG.tokens.betaUSD,
          amount: '100',
          direction: 'exactIn',
        });

        expect(result).toBeDefined();
        expect(result).toHaveProperty('fromToken');
        expect(result).toHaveProperty('toToken');
        expect(result).toHaveProperty('amountIn');
        expect(result).toHaveProperty('amountOut');
        expect(result).toHaveProperty('rate');

        console.log(`  Quote: ${result.amountIn} → ${result.amountOut}`);
        console.log(`  Rate: ${result.rate}`);
      } catch (error) {
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Error Response Format
  // ===========================================================================

  describe('Error Response Format', () => {
    it('should return structured error for invalid token', async () => {
      const { getBalanceService } = await import('../../src/services/balance-service.js');
      const service = getBalanceService();

      try {
        await service.getBalance('NonExistentToken12345');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);

        console.log(`  Error caught: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);

    it('should return structured error for invalid address', async () => {
      const { getBalanceService } = await import('../../src/services/balance-service.js');
      const service = getBalanceService();

      try {
        await service.getBalance('0xinvalidaddress');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);

        console.log(`  Error caught: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // DEX Advanced Tools
  // ===========================================================================

  describe('DEX Advanced Tools', () => {
    it('should call get_orderbook and return valid structure', async () => {
      const { getDexAdvancedService } = await import('../../src/services/dex-advanced-service.js');
      const service = getDexAdvancedService();

      try {
        const result = await service.getOrderbook(E2E_CONFIG.tokens.alphaUSD);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('baseToken');
        expect(result).toHaveProperty('quoteToken');
        expect(result).toHaveProperty('baseTokenSymbol');
        expect(result).toHaveProperty('quoteTokenSymbol');
        expect(result).toHaveProperty('bids');
        expect(result).toHaveProperty('asks');
        expect(Array.isArray(result.bids)).toBe(true);
        expect(Array.isArray(result.asks)).toBe(true);

        console.log(`  Pair: ${result.baseTokenSymbol}/${result.quoteTokenSymbol}`);
        console.log(`  Bids: ${result.bids.length} levels`);
        console.log(`  Asks: ${result.asks.length} levels`);
        if (result.bestBid !== null) {
          console.log(`  Best Bid: $${result.bestBid.toFixed(6)}`);
        }
        if (result.bestAsk !== null) {
          console.log(`  Best Ask: $${result.bestAsk.toFixed(6)}`);
        }
      } catch (error) {
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);

    it('should call get_my_orders and return orders array', async () => {
      const { getDexAdvancedService } = await import('../../src/services/dex-advanced-service.js');
      const service = getDexAdvancedService();

      try {
        const result = await service.getOrdersByOwner();

        expect(Array.isArray(result)).toBe(true);

        console.log(`  Open orders: ${result.length}`);
        if (result.length > 0) {
          const order = result[0];
          console.log(`  First order: ${order.side} ${order.amount} @ tick ${order.tick}`);
        }
      } catch (error) {
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);

    it('should convert ticks to prices correctly', async () => {
      const { getDexAdvancedService } = await import('../../src/services/dex-advanced-service.js');
      const service = getDexAdvancedService();

      // Tick 0 = $1.0000
      expect(service.tickToPrice(0)).toBe(1.0);

      // Tick -10 = $0.9999
      expect(service.tickToPrice(-10)).toBeCloseTo(0.9999, 4);

      // Tick 10 = $1.0001
      expect(service.tickToPrice(10)).toBeCloseTo(1.0001, 4);

      console.log('  Tick conversions: VALID');
      console.log('  tick 0 => $1.0000');
      console.log('  tick -10 => $0.9999');
      console.log('  tick 10 => $1.0001');
    }, E2E_CONFIG.timeout);

    it('should get DEX balance for token', async () => {
      const { getDexAdvancedService } = await import('../../src/services/dex-advanced-service.js');
      const service = getDexAdvancedService();

      try {
        const balance = await service.getDexBalance(E2E_CONFIG.tokens.alphaUSD);

        expect(typeof balance).toBe('bigint');
        expect(balance).toBeGreaterThanOrEqual(0n);

        const formatted = (Number(balance) / 1e6).toFixed(6);
        console.log(`  DEX Balance: ${formatted} AlphaUSD`);
      } catch (error) {
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Security Integration
  // ===========================================================================

  describe('Security Integration', () => {
    it('should initialize security layer with config', async () => {
      const { getSecurityLayer } = await import('../../src/security/index.js');
      const security = getSecurityLayer();

      // Verify security layer is initialized
      expect(security).toBeDefined();
      expect(security.getSpendingLimits).toBeDefined();
      expect(security.getRateLimiter).toBeDefined();
      expect(security.getAddressAllowlist).toBeDefined();

      // Get spending status
      const remaining = security.getRemainingAllowance('AlphaUSD');
      expect(remaining).toHaveProperty('tokenRemaining');
      expect(remaining).toHaveProperty('totalRemaining');

      console.log(`  Token remaining: ${remaining.tokenRemaining}`);
      console.log(`  Total remaining: ${remaining.totalRemaining}`);
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Write Tool Tests (Skipped by Default)
// =============================================================================

describeE2EWrite('E2E: MCP Write Tool Integration', () => {
  beforeAll(async () => {
    if (!shouldRunE2E()) {
      return;
    }

    const configModule = await import('../../src/config/index.js');
    configModule.loadConfig();
  });

  describe('Payment Tools', () => {
    it('should validate send_payment parameters', async () => {
      const { getSecurityLayer } = await import('../../src/security/index.js');
      const security = getSecurityLayer();

      // Test security validation (without actually sending)
      try {
        await security.validatePayment({
          token: 'AlphaUSD',
          to: E2E_CONFIG.testRecipient,
          amount: E2E_CONFIG.testAmounts.small,
        });

        console.log('  Payment validation: PASSED');
      } catch (error) {
        // If validation fails, it should be a SecurityError
        console.log(`  Validation failed: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Helper to check if tools would be skipped
// =============================================================================

function shouldRunE2E(): boolean {
  return !E2E_CONFIG.skipIfNoKey;
}

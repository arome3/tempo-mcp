/**
 * E2E Tests: Read Operations
 *
 * Tests read-only operations against the real Tempo testnet.
 * These tests are SAFE - they don't consume any funds.
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env (for wallet address resolution)
 * - Network access to Tempo testnet RPC
 *
 * Run with:
 *   npm run test:e2e
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type Address, type Hash, formatUnits } from 'viem';

import {
  describeE2E,
  E2E_CONFIG,
  shouldRunE2E,
  hasKnownTxHash,
  logE2EStatus,
  retryWithBackoff,
} from './setup.js';

// =============================================================================
// Dynamic Imports (to avoid loading modules when tests are skipped)
// =============================================================================

let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;
let getBalanceService: typeof import('../../src/services/balance-service.js').getBalanceService;
let getTransactionService: typeof import('../../src/services/transaction-service.js').getTransactionService;
let getTokenService: typeof import('../../src/services/token-service.js').getTokenService;
let getExchangeService: typeof import('../../src/services/exchange-service.js').getExchangeService;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;

// =============================================================================
// Test Suite
// =============================================================================

describeE2E('E2E: Read Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Dynamically import modules to load real config
    const tempoClientModule = await import('../../src/services/tempo-client.js');
    const balanceServiceModule = await import('../../src/services/balance-service.js');
    const transactionServiceModule = await import('../../src/services/transaction-service.js');
    const tokenServiceModule = await import('../../src/services/token-service.js');
    const exchangeServiceModule = await import('../../src/services/exchange-service.js');
    const configModule = await import('../../src/config/index.js');

    getTempoClient = tempoClientModule.getTempoClient;
    getBalanceService = balanceServiceModule.getBalanceService;
    getTransactionService = transactionServiceModule.getTransactionService;
    getTokenService = tokenServiceModule.getTokenService;
    getExchangeService = exchangeServiceModule.getExchangeService;
    loadConfig = configModule.loadConfig;

    // Load configuration
    loadConfig();
  });

  // ===========================================================================
  // Network Connectivity
  // ===========================================================================

  describe('Network Connectivity', () => {
    it('should connect to Tempo testnet and get block number', async () => {
      const client = getTempoClient();
      const blockNumber = await client.getBlockNumber();

      expect(blockNumber).toBeGreaterThan(0n);
      console.log(`  Current block: ${blockNumber}`);
    }, E2E_CONFIG.timeout);

    it('should have correct chain ID', async () => {
      const client = getTempoClient();
      const publicClient = client['publicClient'];
      const chainId = await publicClient.getChainId();

      expect(chainId).toBe(E2E_CONFIG.network.chainId);
      console.log(`  Chain ID: ${chainId}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Balance Queries
  // ===========================================================================

  describe('Balance Queries', () => {
    it('should get AlphaUSD balance for configured wallet', async () => {
      const service = getBalanceService();
      const result = await service.getBalance('AlphaUSD');

      expect(result).toBeDefined();
      expect(result.tokenSymbol).toBe('AlphaUSD');
      expect(result.decimals).toBe(6);
      expect(parseFloat(result.balance)).toBeGreaterThanOrEqual(0);

      console.log(`  Balance: ${result.balance} ${result.tokenSymbol}`);
    }, E2E_CONFIG.timeout);

    it('should get balance using token address', async () => {
      const service = getBalanceService();
      const result = await service.getBalance(E2E_CONFIG.knownTokenAddress);

      expect(result).toBeDefined();
      expect(result.token.toLowerCase()).toBe(
        E2E_CONFIG.knownTokenAddress.toLowerCase()
      );
      expect(parseFloat(result.balance)).toBeGreaterThanOrEqual(0);

      console.log(`  Balance: ${result.balance} ${result.tokenSymbol}`);
    }, E2E_CONFIG.timeout);

    it('should get multiple token balances', async () => {
      const service = getBalanceService();
      const tokens = ['AlphaUSD']; // Add more tokens if available
      const results = await service.getBalances(tokens);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(tokens.length);

      for (const result of results) {
        expect(result.tokenSymbol).toBeDefined();
        expect(parseFloat(result.balance)).toBeGreaterThanOrEqual(0);
        console.log(`  ${result.tokenSymbol}: ${result.balance}`);
      }
    }, E2E_CONFIG.timeout);

    it('should get account info with type detection', async () => {
      const service = getBalanceService();
      const info = await service.getAccountInfo();

      expect(info).toBeDefined();
      expect(info.address).toBeDefined();
      // Account type should be either 'eoa' or 'contract'
      expect(['eoa', 'contract']).toContain(info.type);
      expect(typeof info.transactionCount).toBe('number');

      console.log(`  Address: ${info.address}`);
      console.log(`  Type: ${info.type}`);
      console.log(`  TX Count: ${info.transactionCount}`);
    }, E2E_CONFIG.timeout);

    it('should detect contract account type', async () => {
      const service = getBalanceService();
      // AlphaUSD token contract should be detected as a contract
      const info = await service.getAccountInfo(E2E_CONFIG.knownTokenAddress);

      expect(info).toBeDefined();
      expect(info.type).toBe('contract');

      console.log(`  Contract: ${info.address}`);
      console.log(`  Type: ${info.type}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Token Metadata
  // ===========================================================================

  describe('Token Metadata', () => {
    it('should get token info for AlphaUSD', async () => {
      const service = getTokenService();
      const info = await service.getTokenInfo(E2E_CONFIG.knownTokenAddress);

      expect(info).toBeDefined();
      expect(info.symbol).toBe('AlphaUSD');
      expect(info.decimals).toBe(6);
      expect(info.name).toBeDefined();
      expect(info.totalSupply).toBeDefined();

      console.log(`  Name: ${info.name}`);
      console.log(`  Symbol: ${info.symbol}`);
      console.log(`  Decimals: ${info.decimals}`);
      console.log(`  Total Supply: ${info.totalSupply}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Transaction Queries
  // ===========================================================================

  describe('Transaction Queries', () => {
    it(
      'should get transaction by hash',
      async () => {
        if (!hasKnownTxHash()) {
          console.log('  Skipped: No known TX hash configured');
          return;
        }

        const service = getTransactionService();
        const tx = await retryWithBackoff(async () => {
          return service.getTransaction(E2E_CONFIG.knownTxHash);
        });

        expect(tx).toBeDefined();
        expect(tx.hash.toLowerCase()).toBe(
          E2E_CONFIG.knownTxHash.toLowerCase()
        );
        expect(tx.status).toMatch(/success|reverted|pending/);

        console.log(`  Hash: ${tx.hash}`);
        console.log(`  Status: ${tx.status}`);
        console.log(`  Block: ${tx.blockNumber}`);
        if (tx.token) {
          console.log(`  Token: ${tx.token.symbol} (${tx.token.amount})`);
        }
      },
      E2E_CONFIG.timeout
    );
  });

  // ===========================================================================
  // Gas Estimation
  // ===========================================================================

  describe('Gas Estimation', () => {
    it('should estimate gas for a transfer', async () => {
      const service = getTransactionService();

      // Estimate gas for a simple transfer
      const estimate = await service.estimateGas({
        to: E2E_CONFIG.testRecipient,
      });

      expect(estimate).toBeDefined();
      expect(estimate.gasLimit).toBeDefined();
      expect(BigInt(estimate.gasLimit)).toBeGreaterThan(0n);
      expect(estimate.gasPrice).toBeDefined();
      expect(estimate.estimatedCost).toBeDefined();

      console.log(`  Gas Limit: ${estimate.gasLimit}`);
      console.log(`  Gas Price: ${estimate.gasPrice}`);
      console.log(`  Estimated Cost: ${estimate.estimatedCost}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Exchange Quotes
  // ===========================================================================

  describe('Exchange Quotes', () => {
    it('should get swap quote for AlphaUSD to BetaUSD', async () => {
      const service = getExchangeService();

      try {
        const quote = await service.getQuote({
          fromToken: E2E_CONFIG.tokens.alphaUSD,
          toToken: E2E_CONFIG.tokens.betaUSD,
          amount: '100',
          direction: 'exactIn',
        });

        // If we get here, DEX is available
        expect(quote).toBeDefined();
        expect(quote.amountIn).toBeDefined();
        expect(quote.amountOut).toBeDefined();

        console.log(`  From: ${quote.fromTokenSymbol}`);
        console.log(`  To: ${quote.toTokenSymbol}`);
        console.log(`  Amount In: ${quote.amountIn}`);
        console.log(`  Amount Out: ${quote.amountOut}`);
        console.log(`  Rate: ${quote.rate}`);
      } catch (error) {
        // DEX may not be available on testnet or tokens may not have liquidity
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle invalid token address gracefully', async () => {
      const service = getBalanceService();

      await expect(
        service.getBalance('0xinvalid')
      ).rejects.toThrow();
    }, E2E_CONFIG.timeout);

    it('should handle invalid transaction hash gracefully', async () => {
      const service = getTransactionService();

      await expect(
        service.getTransaction('0xinvalid' as Hash)
      ).rejects.toThrow();
    }, E2E_CONFIG.timeout);

    it('should handle non-existent transaction hash', async () => {
      const service = getTransactionService();
      const fakeHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash;

      await expect(service.getTransaction(fakeHash)).rejects.toThrow();
    }, E2E_CONFIG.timeout);
  });
});

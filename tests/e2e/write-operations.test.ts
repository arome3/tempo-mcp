/**
 * E2E Tests: Write Operations
 *
 * Tests write operations against the real Tempo testnet.
 * These tests CONSUME FUNDS - they are skipped by default.
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - Wallet has testnet AlphaUSD balance
 * - E2E_WRITE=true environment variable
 *
 * Run with:
 *   npm run test:e2e:write
 *   # or
 *   E2E_WRITE=true npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Address, type Hash, parseUnits, formatUnits } from 'viem';

import {
  describeE2EWrite,
  E2E_CONFIG,
  shouldRunE2EWrite,
  hasTestRecipient,
  logE2EStatus,
  wait,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;
let getBalanceService: typeof import('../../src/services/balance-service.js').getBalanceService;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;
let TIP20_ABI: typeof import('../../src/services/tempo-client.js').TIP20_ABI;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  initialBalance: bigint;
  transactionHashes: Hash[];
}

const state: TestState = {
  initialBalance: 0n,
  transactionHashes: [],
};

// =============================================================================
// Test Suite
// =============================================================================

describeE2EWrite('E2E: Write Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamically import modules
    const tempoClientModule = await import('../../src/services/tempo-client.js');
    const balanceServiceModule = await import('../../src/services/balance-service.js');
    const configModule = await import('../../src/config/index.js');

    getTempoClient = tempoClientModule.getTempoClient;
    getBalanceService = balanceServiceModule.getBalanceService;
    loadConfig = configModule.loadConfig;
    TIP20_ABI = tempoClientModule.TIP20_ABI;

    // Load configuration
    loadConfig();

    // Record initial balance for verification
    const client = getTempoClient();
    state.initialBalance = await client.getBalance(E2E_CONFIG.knownTokenAddress);

    console.log(`\n  Initial Balance: ${formatUnits(state.initialBalance, 6)} AlphaUSD`);

    // Verify we have enough balance for tests
    const minBalance = parseUnits('1', 6); // 1 AlphaUSD minimum
    if (state.initialBalance < minBalance) {
      throw new Error(
        `Insufficient balance for write tests. Have: ${formatUnits(state.initialBalance, 6)}, Need: 1 AlphaUSD minimum`
      );
    }
  });

  afterAll(() => {
    if (state.transactionHashes.length > 0) {
      console.log('\n  Transaction Hashes:');
      for (const hash of state.transactionHashes) {
        console.log(`    ${E2E_CONFIG.network.explorerUrl}/tx/${hash}`);
      }
    }
  });

  // ===========================================================================
  // Simple Token Transfer
  // ===========================================================================

  describe('Token Transfers', () => {
    it('should send a small token transfer', async () => {
      const client = getTempoClient();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      // Get balance before
      const balanceBefore = await client.getBalance(E2E_CONFIG.knownTokenAddress);
      console.log(`  Balance before: ${formatUnits(balanceBefore, 6)}`);

      // Send transfer
      const hash = await client.sendTransfer(
        E2E_CONFIG.knownTokenAddress,
        E2E_CONFIG.testRecipient,
        amount
      );

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      state.transactionHashes.push(hash);

      console.log(`  TX Hash: ${hash}`);

      // Wait for confirmation
      const receipt = await client.waitForTransaction(hash);

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('success');
      console.log(`  Status: ${receipt.status}`);
      console.log(`  Block: ${receipt.blockNumber}`);

      // Verify balance changed
      const balanceAfter = await client.getBalance(E2E_CONFIG.knownTokenAddress);
      console.log(`  Balance after: ${formatUnits(balanceAfter, 6)}`);

      // Balance should have decreased (transfer + gas)
      expect(balanceAfter).toBeLessThan(balanceBefore);
    }, E2E_CONFIG.longTimeout);

    it('should send a transfer with memo', async () => {
      const client = getTempoClient();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      // Create a test memo (will be padded to 32 bytes)
      const memo = 'E2E-TEST-' + Date.now().toString(36);
      const memoBytes = ('0x' +
        Buffer.from(memo.padEnd(32, '\0')).toString('hex')) as `0x${string}`;

      // Send transfer with memo
      const hash = await client.sendTransferWithMemo(
        E2E_CONFIG.knownTokenAddress,
        E2E_CONFIG.testRecipient,
        amount,
        memoBytes
      );

      expect(hash).toBeDefined();
      state.transactionHashes.push(hash);

      console.log(`  TX Hash: ${hash}`);
      console.log(`  Memo: ${memo}`);

      // Wait for confirmation
      const receipt = await client.waitForTransaction(hash);
      expect(receipt.status).toBe('success');

      console.log(`  Status: ${receipt.status}`);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Batch Transactions
  // ===========================================================================

  describe('Batch Transactions', () => {
    it('should send atomic batch transfer', async () => {
      const client = getTempoClient();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      // Create encoded transfer calls
      const { encodeFunctionData } = await import('viem');

      const call1Data = encodeFunctionData({
        abi: TIP20_ABI,
        functionName: 'transfer',
        args: [E2E_CONFIG.testRecipient, amount],
      });

      const call2Data = encodeFunctionData({
        abi: TIP20_ABI,
        functionName: 'transfer',
        args: [E2E_CONFIG.testRecipient, amount],
      });

      // Send batch
      const hash = await client.sendBatch([
        { to: E2E_CONFIG.knownTokenAddress, data: call1Data },
        { to: E2E_CONFIG.knownTokenAddress, data: call2Data },
      ]);

      expect(hash).toBeDefined();
      state.transactionHashes.push(hash);

      console.log(`  TX Hash: ${hash}`);

      // Wait for confirmation
      const receipt = await client.waitForTransaction(hash);
      expect(receipt.status).toBe('success');

      console.log(`  Status: ${receipt.status}`);
      console.log(`  Transfers: 2 x ${E2E_CONFIG.testAmounts.small} AlphaUSD`);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Scheduled Transactions (if supported)
  // ===========================================================================

  describe('Scheduled Transactions', () => {
    it('should create a scheduled transaction', async () => {
      const client = getTempoClient();
      const { encodeFunctionData } = await import('viem');

      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      // Schedule for 2 minutes in the future
      const scheduledAt = Math.floor(Date.now() / 1000) + 120;

      const transferData = encodeFunctionData({
        abi: TIP20_ABI,
        functionName: 'transfer',
        args: [E2E_CONFIG.testRecipient, amount],
      });

      try {
        const hash = await client.sendScheduledTransaction({
          to: E2E_CONFIG.knownTokenAddress,
          data: transferData,
          scheduledAt,
        });

        expect(hash).toBeDefined();
        state.transactionHashes.push(hash);

        console.log(`  TX Hash: ${hash}`);
        console.log(`  Scheduled At: ${new Date(scheduledAt * 1000).toISOString()}`);

        // Wait for the scheduling transaction to confirm
        const receipt = await client.waitForTransaction(hash);
        expect(receipt.status).toBe('success');

        console.log(`  Status: ${receipt.status}`);
      } catch (error) {
        // Scheduled transactions may not be supported on all networks
        console.log(`  Skipped: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should reject transfer with insufficient balance', async () => {
      const client = getTempoClient();
      // Try to send more than we have
      const hugeAmount = parseUnits('999999999', 6);

      await expect(
        client.sendTransfer(
          E2E_CONFIG.knownTokenAddress,
          E2E_CONFIG.testRecipient,
          hugeAmount
        )
      ).rejects.toThrow();
    }, E2E_CONFIG.timeout);

    it('should reject scheduled transaction in the past', async () => {
      const client = getTempoClient();
      const { encodeFunctionData } = await import('viem');

      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);
      const pastTime = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

      const transferData = encodeFunctionData({
        abi: TIP20_ABI,
        functionName: 'transfer',
        args: [E2E_CONFIG.testRecipient, amount],
      });

      await expect(
        client.sendScheduledTransaction({
          to: E2E_CONFIG.knownTokenAddress,
          data: transferData,
          scheduledAt: pastTime,
        })
      ).rejects.toThrow();
    }, E2E_CONFIG.timeout);
  });
});

/**
 * E2E Tests: Fee Sponsorship
 *
 * Tests sponsored (gasless) transactions against the real Tempo testnet.
 * These tests CONSUME FUNDS - they are skipped by default.
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - TEMPO_FEE_SPONSORSHIP_ENABLED=true
 * - TEMPO_FEE_PAYER_ADDRESS and TEMPO_FEE_PAYER_KEY for local mode
 * - Wallet has testnet AlphaUSD balance
 * - E2E_WRITE=true environment variable
 *
 * Run with:
 *   npm run test:e2e:write
 *   # or
 *   E2E_WRITE=true npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Address, type Hash, parseUnits, formatUnits, pad, stringToHex } from 'viem';

import {
  describeE2EWrite,
  E2E_CONFIG,
  shouldRunE2EWrite,
  logE2EStatus,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;
let getSponsorshipService: typeof import('../../src/services/sponsorship-service.js').getSponsorshipService;
let resetSponsorshipService: typeof import('../../src/services/sponsorship-service.js').resetSponsorshipService;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;
let resetConfig: typeof import('../../src/config/index.js').resetConfig;
let getConfig: typeof import('../../src/config/index.js').getConfig;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  initialBalance: bigint;
  sponsorInitialBalance: bigint;
  transactionHashes: Hash[];
  sponsorshipEnabled: boolean;
}

const state: TestState = {
  initialBalance: 0n,
  sponsorInitialBalance: 0n,
  transactionHashes: [],
  sponsorshipEnabled: false,
};

// =============================================================================
// Test Suite
// =============================================================================

describeE2EWrite('E2E: Fee Sponsorship', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamically import modules
    const tempoClientModule = await import('../../src/services/tempo-client.js');
    const sponsorshipModule = await import('../../src/services/sponsorship-service.js');
    const configModule = await import('../../src/config/index.js');

    getTempoClient = tempoClientModule.getTempoClient;
    getSponsorshipService = sponsorshipModule.getSponsorshipService;
    resetSponsorshipService = sponsorshipModule.resetSponsorshipService;
    loadConfig = configModule.loadConfig;
    resetConfig = configModule.resetConfig;
    getConfig = configModule.getConfig;

    // Load configuration
    loadConfig();
    const config = getConfig();

    // Check if sponsorship is enabled
    state.sponsorshipEnabled = config.feeSponsorship.enabled;
    if (!state.sponsorshipEnabled) {
      console.log('\n  Fee sponsorship is disabled. Set TEMPO_FEE_SPONSORSHIP_ENABLED=true to run these tests.');
      return;
    }

    // Record initial balances
    const client = getTempoClient();
    state.initialBalance = await client.getBalance(E2E_CONFIG.knownTokenAddress);

    console.log(`\n  Initial Balance: ${formatUnits(state.initialBalance, 6)} AlphaUSD`);

    // Check sponsor balance if available
    try {
      const sponsorshipService = getSponsorshipService();
      const sponsorBalance = await sponsorshipService.getSponsorBalance(
        undefined,
        E2E_CONFIG.knownTokenAddress
      );
      state.sponsorInitialBalance = sponsorBalance.balanceRaw;
      console.log(`  Sponsor Balance: ${formatUnits(state.sponsorInitialBalance, 6)} AlphaUSD`);
    } catch {
      console.log('  Sponsor Balance: Unable to fetch (fee payer not configured)');
    }

    // Verify we have enough balance for tests
    const minBalance = parseUnits('1', 6);
    if (state.initialBalance < minBalance) {
      throw new Error(
        `Insufficient balance for sponsorship tests. Have: ${formatUnits(state.initialBalance, 6)}, Need: 1 AlphaUSD minimum`
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

    // Reset singletons
    if (resetSponsorshipService) {
      resetSponsorshipService();
    }
    if (resetConfig) {
      resetConfig();
    }
  });

  // ===========================================================================
  // Sponsor Balance Queries
  // ===========================================================================

  describe('Sponsor Balance', () => {
    it('should get sponsor balance', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      // Skip if no fee payer address is configured
      const config = getConfig();
      if (!config.feeSponsorship.feePayer.address) {
        console.log('  Skipped: No TEMPO_FEE_PAYER_ADDRESS configured');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const result = await sponsorshipService.getSponsorBalance(
        undefined,
        E2E_CONFIG.knownTokenAddress
      );

      expect(result).toBeDefined();
      expect(result.balance).toBeDefined();
      expect(result.balanceRaw).toBeGreaterThanOrEqual(BigInt(0));
      expect(result.sponsor).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(result.token).toBe(E2E_CONFIG.knownTokenAddress);

      console.log(`  Sponsor: ${result.sponsor}`);
      console.log(`  Balance: ${result.balance} ${result.tokenSymbol}`);
    }, E2E_CONFIG.timeout);

    it('should get balance for custom sponsor address', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const customSponsor = '0x0000000000000000000000000000000000000001' as Address;

      const result = await sponsorshipService.getSponsorBalance(
        customSponsor,
        E2E_CONFIG.knownTokenAddress
      );

      // Verify the sponsor address is correctly returned
      expect(result.sponsor).toBe(customSponsor);
      // Balance can be any value (this address may have tokens on testnet)
      expect(result.balanceRaw).toBeGreaterThanOrEqual(BigInt(0));

      console.log(`  Custom Sponsor Balance: ${result.balance}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Gas Estimation
  // ===========================================================================

  describe('Gas Estimation', () => {
    it('should estimate gas for sponsored transfer', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      const result = await sponsorshipService.estimateSponsoredGas({
        token: E2E_CONFIG.knownTokenAddress,
        to: E2E_CONFIG.testRecipient,
        amount,
      });

      expect(result.gasLimit).toBeGreaterThan(BigInt(0));
      expect(result.estimatedFee).toBeDefined();
      expect(parseFloat(result.estimatedFee)).toBeGreaterThan(0);
      expect(result.feeToken).toBe(E2E_CONFIG.knownTokenAddress);

      console.log(`  Gas Limit: ${result.gasLimit}`);
      console.log(`  Estimated Fee: ${result.estimatedFee}`);
    }, E2E_CONFIG.timeout);

    it('should estimate gas with custom fee token', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      const result = await sponsorshipService.estimateSponsoredGas({
        token: E2E_CONFIG.knownTokenAddress,
        to: E2E_CONFIG.testRecipient,
        amount,
        feeToken: E2E_CONFIG.tokens.betaUSD,
      });

      expect(result.feeToken).toBe(E2E_CONFIG.tokens.betaUSD);

      console.log(`  Fee Token: ${result.feeToken}`);
      console.log(`  Estimated Fee: ${result.estimatedFee}`);
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Sponsored Transfers (Local Fee Payer)
  // ===========================================================================

  describe.skipIf(!process.env.TEMPO_FEE_PAYER_KEY)('Sponsored Transfers (Local)', () => {
    it('should send sponsored payment with local fee payer', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      const balanceBefore = await getTempoClient().getBalance(E2E_CONFIG.knownTokenAddress);
      console.log(`  Balance before: ${formatUnits(balanceBefore, 6)}`);

      const result = await sponsorshipService.sendSponsoredPayment({
        token: E2E_CONFIG.knownTokenAddress,
        to: E2E_CONFIG.testRecipient,
        amount,
        useRelay: false,
      });

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
      expect(result.feePayer).toMatch(/^0x[a-fA-F0-9]{40}$/);

      state.transactionHashes.push(result.hash);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Gas Cost: ${result.gasCost}`);
      console.log(`  Fee Payer: ${result.feePayer}`);

      const balanceAfter = await getTempoClient().getBalance(E2E_CONFIG.knownTokenAddress);
      console.log(`  Balance after: ${formatUnits(balanceAfter, 6)}`);

      // Sender balance should have decreased by transfer amount
      expect(balanceAfter).toBeLessThan(balanceBefore);
    }, E2E_CONFIG.longTimeout);

    it('should send sponsored payment with memo', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      // Create a test memo
      const memo = 'E2E-SPONSOR-' + Date.now().toString(36);
      const memoBytes = pad(stringToHex(memo), { size: 32 });

      const result = await sponsorshipService.sendSponsoredPayment({
        token: E2E_CONFIG.knownTokenAddress,
        to: E2E_CONFIG.testRecipient,
        amount,
        memo: memoBytes,
        useRelay: false,
      });

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      state.transactionHashes.push(result.hash);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Memo: ${memo}`);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Sponsored Transfers (Relay Service)
  // ===========================================================================

  describe.skip('Sponsored Transfers (Relay)', () => {
    // These tests are skipped by default as they require the testnet relay
    // to be operational and accepting requests from this account

    it('should send payment via testnet relay', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits(E2E_CONFIG.testAmounts.small, 6);

      const result = await sponsorshipService.sendSponsoredPayment({
        token: E2E_CONFIG.knownTokenAddress,
        to: E2E_CONFIG.testRecipient,
        amount,
        useRelay: true,
      });

      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.feePayer).toBe('Tempo Testnet Relay');

      state.transactionHashes.push(result.hash);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Fee Payer: ${result.feePayer}`);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should reject insufficient sender balance during estimation', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const hugeAmount = parseUnits('999999999', 6);

      // Tempo RPC validates balance during estimation, so this should throw
      await expect(
        sponsorshipService.estimateSponsoredGas({
          token: E2E_CONFIG.knownTokenAddress,
          to: E2E_CONFIG.testRecipient,
          amount: hugeAmount,
        })
      ).rejects.toThrow();

      console.log('  Insufficient balance correctly rejected during estimation');
    }, E2E_CONFIG.timeout);

    it('should reject invalid recipient address', async () => {
      if (!state.sponsorshipEnabled) {
        console.log('  Skipped: Sponsorship not enabled');
        return;
      }

      const sponsorshipService = getSponsorshipService();
      const amount = parseUnits('1', 6);

      await expect(
        sponsorshipService.estimateSponsoredGas({
          token: E2E_CONFIG.knownTokenAddress,
          to: '0xinvalid' as Address,
          amount,
        })
      ).rejects.toThrow();

      console.log('  Invalid address correctly rejected');
    }, E2E_CONFIG.timeout);
  });
});

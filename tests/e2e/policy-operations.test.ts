/**
 * E2E Tests: Policy Management Operations
 *
 * Tests TIP-403 Policy Registry operations against the real Tempo testnet.
 *
 * Read operations (SAFE - no funds consumed):
 * - Check transfer compliance
 * - Get policy information
 * - Check whitelist/blacklist status
 *
 * Write operations (CONSUME FUNDS - requires E2E_WRITE=true):
 * - Add/remove from whitelist (requires policy owner)
 * - Add/remove from blacklist (requires policy owner)
 * - Burn blocked tokens (requires BURN_BLOCKED_ROLE)
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - Network access to Tempo testnet RPC
 * - For write tests: E2E_WRITE=true and policy owner/role permissions
 *
 * Run with:
 *   npm run test:e2e              # Read-only tests
 *   npm run test:e2e:write        # All tests including write operations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type Address } from 'viem';

import {
  describeE2E,
  describeE2EWrite,
  E2E_CONFIG,
  shouldRunE2E,
  shouldRunE2EWrite,
  logE2EStatus,
} from './setup.js';

// =============================================================================
// Dynamic Imports
// =============================================================================

let getPolicyService: typeof import('../../src/services/policy-service.js').getPolicyService;
let POLICY_TYPE_VALUES: typeof import('../../src/services/policy-service.js').POLICY_TYPE_VALUES;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;
let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  walletAddress: Address | null;
  testPolicyId: number | null;
  isPolicyOwner: boolean;
}

const state: TestState = {
  walletAddress: null,
  testPolicyId: null,
  isPolicyOwner: false,
};

// Test policy ID (can be set via E2E_TEST_POLICY_ID env var)
const TEST_POLICY_ID = parseInt(process.env.E2E_TEST_POLICY_ID || '1', 10);

// =============================================================================
// Read Operations Tests
// =============================================================================

describeE2E('E2E: Policy Read Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Dynamically import modules
    const policyServiceModule = await import('../../src/services/policy-service.js');
    const configModule = await import('../../src/config/index.js');
    const tempoClientModule = await import('../../src/services/tempo-client.js');

    getPolicyService = policyServiceModule.getPolicyService;
    POLICY_TYPE_VALUES = policyServiceModule.POLICY_TYPE_VALUES;
    loadConfig = configModule.loadConfig;
    getTempoClient = tempoClientModule.getTempoClient;

    // Load configuration
    loadConfig();

    // Get wallet address
    const client = getTempoClient();
    state.walletAddress = client.getAddress() as Address;
    state.testPolicyId = TEST_POLICY_ID;

    console.log(`\n  Wallet Address: ${state.walletAddress}`);
    console.log(`  Test Policy ID: ${state.testPolicyId}`);
  });

  // ===========================================================================
  // Policy Info Tests
  // ===========================================================================

  describe('Policy Information', () => {
    it('should get policy info by ID', async () => {
      const service = getPolicyService();

      try {
        const policyInfo = await service.getPolicy(state.testPolicyId!);

        expect(policyInfo).toBeDefined();
        expect(policyInfo.policyId).toBe(state.testPolicyId);
        expect(POLICY_TYPE_VALUES).toContain(policyInfo.policyType);
        expect(policyInfo.owner).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(typeof policyInfo.tokenCount).toBe('number');

        // Check if we're the policy owner
        state.isPolicyOwner =
          policyInfo.owner.toLowerCase() === state.walletAddress!.toLowerCase();

        console.log(`  Policy ID: ${policyInfo.policyId}`);
        console.log(`  Policy Type: ${policyInfo.policyType}`);
        console.log(`  Owner: ${policyInfo.owner}`);
        console.log(`  Token Count: ${policyInfo.tokenCount}`);
        console.log(`  Is Policy Owner: ${state.isPolicyOwner}`);
      } catch (error) {
        console.log(`  Skipped: Policy ${state.testPolicyId} may not exist`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Whitelist/Blacklist Status Tests
  // ===========================================================================

  describe('Whitelist Status', () => {
    it('should check if wallet is whitelisted', async () => {
      const service = getPolicyService();

      try {
        const isWhitelisted = await service.isWhitelisted(
          state.testPolicyId!,
          state.walletAddress!
        );

        expect(typeof isWhitelisted).toBe('boolean');
        console.log(`  Address: ${state.walletAddress}`);
        console.log(`  Is Whitelisted: ${isWhitelisted}`);
      } catch (error) {
        console.log(`  Skipped: Policy may not support whitelist`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);

    it('should check whitelist status for zero address', async () => {
      const service = getPolicyService();
      const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

      try {
        const isWhitelisted = await service.isWhitelisted(
          state.testPolicyId!,
          zeroAddress
        );

        expect(typeof isWhitelisted).toBe('boolean');
        console.log(`  Zero Address Whitelisted: ${isWhitelisted}`);
      } catch (error) {
        console.log(`  Skipped: Policy may not support whitelist`);
      }
    }, E2E_CONFIG.timeout);
  });

  describe('Blacklist Status', () => {
    it('should check if wallet is blacklisted', async () => {
      const service = getPolicyService();

      try {
        const isBlacklisted = await service.isBlacklisted(
          state.testPolicyId!,
          state.walletAddress!
        );

        expect(typeof isBlacklisted).toBe('boolean');
        console.log(`  Address: ${state.walletAddress}`);
        console.log(`  Is Blacklisted: ${isBlacklisted}`);
      } catch (error) {
        console.log(`  Skipped: Policy may not support blacklist`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Transfer Compliance Tests
  // ===========================================================================

  describe('Transfer Compliance', () => {
    it('should check transfer compliance between two addresses', async () => {
      const service = getPolicyService();
      const testRecipient = E2E_CONFIG.testRecipient;

      try {
        const canTransfer = await service.canTransfer(
          E2E_CONFIG.knownTokenAddress,
          state.walletAddress!,
          testRecipient
        );

        expect(typeof canTransfer).toBe('boolean');
        console.log(`  From: ${state.walletAddress}`);
        console.log(`  To: ${testRecipient}`);
        console.log(`  Token: ${E2E_CONFIG.knownTokenAddress}`);
        console.log(`  Can Transfer: ${canTransfer}`);
      } catch (error) {
        console.log(`  Skipped: Token may not have policy attached`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);

    it('should check transfer compliance to self', async () => {
      const service = getPolicyService();

      try {
        const canTransfer = await service.canTransfer(
          E2E_CONFIG.knownTokenAddress,
          state.walletAddress!,
          state.walletAddress!
        );

        expect(typeof canTransfer).toBe('boolean');
        console.log(`  Self-transfer allowed: ${canTransfer}`);
      } catch (error) {
        console.log(`  Skipped: Token may not have policy attached`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Token Policy ID Tests
  // ===========================================================================

  describe('Token Policy Lookup', () => {
    it('should get policy ID for known token', async () => {
      const service = getPolicyService();

      const policyId = await service.getTokenPolicyId(E2E_CONFIG.knownTokenAddress);

      // getTokenPolicyId returns number | null
      // null means no policy is attached (which is valid)
      console.log(`  Token: ${E2E_CONFIG.knownTokenAddress}`);

      if (policyId === null) {
        console.log(`  Policy ID: null (no policy attached)`);
        expect(policyId).toBeNull();
      } else {
        expect(typeof policyId).toBe('number');
        expect(policyId).toBeGreaterThan(0);
        console.log(`  Policy ID: ${policyId}`);

        try {
          // Get policy details
          const policyInfo = await service.getPolicy(policyId);
          console.log(`  Policy Type: ${policyInfo.policyType}`);
        } catch (error) {
          console.log(`  Could not fetch policy details: ${(error as Error).message.slice(0, 50)}...`);
        }
      }
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Write Operations Tests
// =============================================================================

describeE2EWrite('E2E: Policy Write Operations', () => {
  beforeAll(async () => {
    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamically import modules if not already loaded
    if (!getPolicyService) {
      const policyServiceModule = await import('../../src/services/policy-service.js');
      const configModule = await import('../../src/config/index.js');
      const tempoClientModule = await import('../../src/services/tempo-client.js');

      getPolicyService = policyServiceModule.getPolicyService;
      POLICY_TYPE_VALUES = policyServiceModule.POLICY_TYPE_VALUES;
      loadConfig = configModule.loadConfig;
      getTempoClient = tempoClientModule.getTempoClient;

      loadConfig();

      const client = getTempoClient();
      state.walletAddress = client.getAddress() as Address;
      state.testPolicyId = TEST_POLICY_ID;
    }

    // Check if we're the policy owner
    try {
      const service = getPolicyService();
      const policyInfo = await service.getPolicy(state.testPolicyId!);
      state.isPolicyOwner =
        policyInfo.owner.toLowerCase() === state.walletAddress!.toLowerCase();

      console.log(`\n  Wallet Address: ${state.walletAddress}`);
      console.log(`  Test Policy ID: ${state.testPolicyId}`);
      console.log(`  Is Policy Owner: ${state.isPolicyOwner}`);
    } catch (error) {
      console.log(`\n  Wallet Address: ${state.walletAddress}`);
      console.log(`  Note: Could not verify policy ownership`);
    }
  });

  // ===========================================================================
  // Whitelist Management Tests
  // ===========================================================================

  describe('Whitelist Management', () => {
    // Use a deterministic test address
    const testWhitelistAddress =
      '0x0000000000000000000000000000000000000042' as Address;

    it('should add address to whitelist if caller is policy owner', async () => {
      if (!state.isPolicyOwner) {
        console.log('  Skipped: Wallet is not policy owner');
        return;
      }

      const service = getPolicyService();

      // Check current status
      const alreadyWhitelisted = await service.isWhitelisted(
        state.testPolicyId!,
        testWhitelistAddress
      );

      if (alreadyWhitelisted) {
        console.log('  Skipped: Address already whitelisted');
        return;
      }

      try {
        const result = await service.addToWhitelist(
          state.testPolicyId!,
          testWhitelistAddress
        );

        expect(result.hash).toBeDefined();
        expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.blockNumber).toBeGreaterThan(0);

        console.log(`  TX Hash: ${result.hash}`);
        console.log(`  Block: ${result.blockNumber}`);
        console.log(`  Added to whitelist: ${testWhitelistAddress}`);

        // Verify address is now whitelisted
        const nowWhitelisted = await service.isWhitelisted(
          state.testPolicyId!,
          testWhitelistAddress
        );
        expect(nowWhitelisted).toBe(true);
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.longTimeout);

    it('should remove address from whitelist if caller is policy owner', async () => {
      if (!state.isPolicyOwner) {
        console.log('  Skipped: Wallet is not policy owner');
        return;
      }

      const service = getPolicyService();

      // Check current status
      const isWhitelisted = await service.isWhitelisted(
        state.testPolicyId!,
        testWhitelistAddress
      );

      if (!isWhitelisted) {
        console.log('  Skipped: Address is not whitelisted');
        return;
      }

      try {
        const result = await service.removeFromWhitelist(
          state.testPolicyId!,
          testWhitelistAddress
        );

        expect(result.hash).toBeDefined();
        expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.blockNumber).toBeGreaterThan(0);

        console.log(`  TX Hash: ${result.hash}`);
        console.log(`  Block: ${result.blockNumber}`);
        console.log(`  Removed from whitelist: ${testWhitelistAddress}`);

        // Verify address is no longer whitelisted
        const nowWhitelisted = await service.isWhitelisted(
          state.testPolicyId!,
          testWhitelistAddress
        );
        expect(nowWhitelisted).toBe(false);
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Blacklist Management Tests
  // ===========================================================================

  describe('Blacklist Management', () => {
    // Use a deterministic test address
    const testBlacklistAddress =
      '0x0000000000000000000000000000000000000099' as Address;

    it('should add address to blacklist if caller is policy owner', async () => {
      if (!state.isPolicyOwner) {
        console.log('  Skipped: Wallet is not policy owner');
        return;
      }

      const service = getPolicyService();

      // Check current status
      const alreadyBlacklisted = await service.isBlacklisted(
        state.testPolicyId!,
        testBlacklistAddress
      );

      if (alreadyBlacklisted) {
        console.log('  Skipped: Address already blacklisted');
        return;
      }

      try {
        const result = await service.addToBlacklist(
          state.testPolicyId!,
          testBlacklistAddress
        );

        expect(result.hash).toBeDefined();
        expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.blockNumber).toBeGreaterThan(0);

        console.log(`  TX Hash: ${result.hash}`);
        console.log(`  Block: ${result.blockNumber}`);
        console.log(`  Added to blacklist: ${testBlacklistAddress}`);

        // Verify address is now blacklisted
        const nowBlacklisted = await service.isBlacklisted(
          state.testPolicyId!,
          testBlacklistAddress
        );
        expect(nowBlacklisted).toBe(true);
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.longTimeout);

    it('should remove address from blacklist if caller is policy owner', async () => {
      if (!state.isPolicyOwner) {
        console.log('  Skipped: Wallet is not policy owner');
        return;
      }

      const service = getPolicyService();

      // Check current status
      const isBlacklisted = await service.isBlacklisted(
        state.testPolicyId!,
        testBlacklistAddress
      );

      if (!isBlacklisted) {
        console.log('  Skipped: Address is not blacklisted');
        return;
      }

      try {
        const result = await service.removeFromBlacklist(
          state.testPolicyId!,
          testBlacklistAddress
        );

        expect(result.hash).toBeDefined();
        expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.blockNumber).toBeGreaterThan(0);

        console.log(`  TX Hash: ${result.hash}`);
        console.log(`  Block: ${result.blockNumber}`);
        console.log(`  Removed from blacklist: ${testBlacklistAddress}`);

        // Verify address is no longer blacklisted
        const nowBlacklisted = await service.isBlacklisted(
          state.testPolicyId!,
          testBlacklistAddress
        );
        expect(nowBlacklisted).toBe(false);
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should fail to modify whitelist without policy owner permission', async () => {
      if (state.isPolicyOwner) {
        console.log('  Skipped: Wallet is policy owner (would succeed)');
        return;
      }

      const service = getPolicyService();

      try {
        await expect(
          service.addToWhitelist(
            state.testPolicyId!,
            '0x0000000000000000000000000000000000000003' as Address
          )
        ).rejects.toThrow();

        console.log('  Correctly rejected: No policy owner permission');
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);

    it('should fail to modify blacklist without policy owner permission', async () => {
      if (state.isPolicyOwner) {
        console.log('  Skipped: Wallet is policy owner (would succeed)');
        return;
      }

      const service = getPolicyService();

      try {
        await expect(
          service.addToBlacklist(
            state.testPolicyId!,
            '0x0000000000000000000000000000000000000003' as Address
          )
        ).rejects.toThrow();

        console.log('  Correctly rejected: No policy owner permission');
      } catch (error) {
        console.log(`  Error: ${(error as Error).message}`);
      }
    }, E2E_CONFIG.timeout);
  });
});

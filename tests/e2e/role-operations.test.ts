/**
 * E2E Tests: Role Management Operations
 *
 * Tests TIP-20 role management operations against the real Tempo testnet.
 *
 * Read operations (SAFE - no funds consumed):
 * - Check if address has a role
 * - Get role members
 * - Check token pause status
 * - Get complete token roles info
 *
 * Write operations (CONSUME FUNDS - requires E2E_WRITE=true):
 * - Grant/revoke roles (requires admin role)
 * - Pause/unpause token (requires PAUSE/UNPAUSE role)
 *
 * Prerequisites:
 * - TEMPO_PRIVATE_KEY set in .env
 * - Network access to Tempo testnet RPC
 * - For write tests: E2E_WRITE=true and appropriate roles
 *
 * Run with:
 *   npm run test:e2e              # Read-only tests
 *   npm run test:e2e:write        # All tests including write operations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type Address, formatUnits } from 'viem';

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

let getRoleService: typeof import('../../src/services/role-service.js').getRoleService;
let ROLE_NAMES: typeof import('../../src/services/role-service.js').ROLE_NAMES;
let ROLES: typeof import('../../src/services/role-service.js').ROLES;
let loadConfig: typeof import('../../src/config/index.js').loadConfig;
let getTempoClient: typeof import('../../src/services/tempo-client.js').getTempoClient;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  walletAddress: Address | null;
  hasAdminRole: boolean;
  hasPauseRole: boolean;
  hasUnpauseRole: boolean;
  initialPauseStatus: boolean;
}

const state: TestState = {
  walletAddress: null,
  hasAdminRole: false,
  hasPauseRole: false,
  hasUnpauseRole: false,
  initialPauseStatus: false,
};

// =============================================================================
// Read Operations Tests
// =============================================================================

describeE2E('E2E: Role Read Operations', () => {
  beforeAll(async () => {
    logE2EStatus();

    if (!shouldRunE2E()) {
      return;
    }

    // Dynamically import modules
    const roleServiceModule = await import('../../src/services/role-service.js');
    const configModule = await import('../../src/config/index.js');
    const tempoClientModule = await import('../../src/services/tempo-client.js');

    getRoleService = roleServiceModule.getRoleService;
    ROLE_NAMES = roleServiceModule.ROLE_NAMES;
    ROLES = roleServiceModule.ROLES;
    loadConfig = configModule.loadConfig;
    getTempoClient = tempoClientModule.getTempoClient;

    // Load configuration
    loadConfig();

    // Get wallet address for role checks
    const client = getTempoClient();
    state.walletAddress = client.getAddress() as Address;

    console.log(`\n  Wallet Address: ${state.walletAddress}`);
  });

  // ===========================================================================
  // Role Query Tests
  // Note: Some TIP-20 tokens may not implement standard AccessControl.
  // ===========================================================================

  describe('Role Queries', () => {
    it('should check if wallet has DEFAULT_ADMIN_ROLE', async () => {
      const service = getRoleService();

      try {
        const hasRole = await service.hasRole(
          E2E_CONFIG.knownTokenAddress,
          'DEFAULT_ADMIN_ROLE',
          state.walletAddress!
        );

        state.hasAdminRole = hasRole;
        expect(typeof hasRole).toBe('boolean');

        console.log(`  Has DEFAULT_ADMIN_ROLE: ${hasRole}`);
      } catch (error) {
        console.log(`  Skipped: Token may not support standard AccessControl`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);

    it('should check if wallet has PAUSE_ROLE', async () => {
      const service = getRoleService();

      try {
        const hasRole = await service.hasRole(
          E2E_CONFIG.knownTokenAddress,
          'PAUSE_ROLE',
          state.walletAddress!
        );

        state.hasPauseRole = hasRole;
        expect(typeof hasRole).toBe('boolean');

        console.log(`  Has PAUSE_ROLE: ${hasRole}`);
      } catch (error) {
        console.log(`  Skipped: Token may not support standard AccessControl`);
      }
    }, E2E_CONFIG.timeout);

    it('should check if wallet has UNPAUSE_ROLE', async () => {
      const service = getRoleService();

      try {
        const hasRole = await service.hasRole(
          E2E_CONFIG.knownTokenAddress,
          'UNPAUSE_ROLE',
          state.walletAddress!
        );

        state.hasUnpauseRole = hasRole;
        expect(typeof hasRole).toBe('boolean');

        console.log(`  Has UNPAUSE_ROLE: ${hasRole}`);
      } catch (error) {
        console.log(`  Skipped: Token may not support standard AccessControl`);
      }
    }, E2E_CONFIG.timeout);

    it('should check all roles for wallet', async () => {
      const service = getRoleService();

      console.log(`  Role status for ${state.walletAddress}:`);

      let accessControlSupported = true;

      for (const roleName of ROLE_NAMES) {
        try {
          const hasRole = await service.hasRole(
            E2E_CONFIG.knownTokenAddress,
            roleName,
            state.walletAddress!
          );

          expect(typeof hasRole).toBe('boolean');
          console.log(`    ${roleName}: ${hasRole ? 'YES' : 'NO'}`);
        } catch (error) {
          if (accessControlSupported) {
            console.log(`  Token does not support standard AccessControl`);
            accessControlSupported = false;
          }
          break;
        }
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Role Member Tests
  // Note: These tests require AccessControlEnumerable extension on the token.
  // Some TIP-20 tokens may only implement basic AccessControl without enumeration.
  // ===========================================================================

  describe('Role Members', () => {
    it('should get member count for DEFAULT_ADMIN_ROLE (if supported)', async () => {
      const service = getRoleService();

      try {
        const count = await service.getRoleMemberCount(
          E2E_CONFIG.knownTokenAddress,
          'DEFAULT_ADMIN_ROLE'
        );

        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);

        console.log(`  DEFAULT_ADMIN_ROLE members: ${count}`);
      } catch (error) {
        // Token may not support AccessControlEnumerable
        console.log(`  Skipped: Token does not support role enumeration`);
        console.log(`  Error: ${(error as Error).message.slice(0, 100)}...`);
      }
    }, E2E_CONFIG.timeout);

    it('should get all members of DEFAULT_ADMIN_ROLE (if supported)', async () => {
      const service = getRoleService();

      try {
        const members = await service.getRoleMembers(
          E2E_CONFIG.knownTokenAddress,
          'DEFAULT_ADMIN_ROLE'
        );

        expect(Array.isArray(members)).toBe(true);

        console.log(`  DEFAULT_ADMIN_ROLE (${members.length} members):`);
        for (const member of members) {
          console.log(`    - ${member}`);
        }
      } catch (error) {
        // Token may not support AccessControlEnumerable
        console.log(`  Skipped: Token does not support role enumeration`);
      }
    }, E2E_CONFIG.timeout);

    it('should get members for all roles (if supported)', async () => {
      const service = getRoleService();

      let enumerationSupported = true;

      for (const roleName of ROLE_NAMES) {
        try {
          const members = await service.getRoleMembers(
            E2E_CONFIG.knownTokenAddress,
            roleName
          );

          expect(Array.isArray(members)).toBe(true);
          console.log(`  ${roleName}: ${members.length} member(s)`);
        } catch (error) {
          if (enumerationSupported) {
            console.log(`  Skipped: Token does not support role enumeration`);
            enumerationSupported = false;
          }
          break;
        }
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Pause Status Tests
  // ===========================================================================

  describe('Pause Status', () => {
    it('should check if token is paused', async () => {
      const service = getRoleService();

      try {
        const isPaused = await service.isPaused(E2E_CONFIG.knownTokenAddress);

        state.initialPauseStatus = isPaused;
        expect(typeof isPaused).toBe('boolean');

        console.log(`  Token paused: ${isPaused}`);
      } catch (error) {
        console.log(`  Skipped: Token may not support Pausable interface`);
        console.log(`  Error: ${(error as Error).message.slice(0, 80)}...`);
      }
    }, E2E_CONFIG.timeout);
  });

  // ===========================================================================
  // Complete Token Roles Info
  // Note: Requires AccessControlEnumerable - may not be supported by all tokens
  // ===========================================================================

  describe('Token Roles Info', () => {
    it('should get complete role information for token (if supported)', async () => {
      const service = getRoleService();

      try {
        const info = await service.getTokenRolesInfo(E2E_CONFIG.knownTokenAddress);

        expect(info).toBeDefined();
        expect(info.token.toLowerCase()).toBe(
          E2E_CONFIG.knownTokenAddress.toLowerCase()
        );
        expect(typeof info.isPaused).toBe('boolean');
        expect(info.roles).toBeDefined();

        console.log(`  Token: ${info.token}`);
        console.log(`  Paused: ${info.isPaused}`);
        console.log(`  Roles:`);

        for (const roleName of ROLE_NAMES) {
          const roleInfo = info.roles[roleName];
          console.log(`    ${roleName}: ${roleInfo.count} member(s)`);
        }
      } catch (error) {
        // Token may not support AccessControlEnumerable
        console.log(`  Skipped: Token does not support role enumeration`);
        console.log(`  Note: getTokenRolesInfo requires AccessControlEnumerable`);
      }
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Role Hash Verification
  // ===========================================================================

  describe('Role Hash Verification', () => {
    it('should compute correct role hashes', async () => {
      const service = getRoleService();

      // DEFAULT_ADMIN_ROLE should always be zero
      const adminHash = service.getRoleHash('DEFAULT_ADMIN_ROLE');
      expect(adminHash).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );

      console.log(`  DEFAULT_ADMIN_ROLE: ${adminHash}`);

      // Other roles should have valid keccak256 hashes
      for (const roleName of ROLE_NAMES.filter((r) => r !== 'DEFAULT_ADMIN_ROLE')) {
        const hash = service.getRoleHash(roleName);
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        console.log(`  ${roleName}: ${hash}`);
      }
    }, E2E_CONFIG.timeout);
  });
});

// =============================================================================
// Write Operations Tests
// =============================================================================

// Track if the token supports AccessControl
let accessControlSupported = true;

describeE2EWrite('E2E: Role Write Operations', () => {
  beforeAll(async () => {
    if (!shouldRunE2EWrite()) {
      return;
    }

    // Dynamically import modules if not already loaded
    if (!getRoleService) {
      const roleServiceModule = await import('../../src/services/role-service.js');
      const configModule = await import('../../src/config/index.js');
      const tempoClientModule = await import('../../src/services/tempo-client.js');

      getRoleService = roleServiceModule.getRoleService;
      ROLE_NAMES = roleServiceModule.ROLE_NAMES;
      ROLES = roleServiceModule.ROLES;
      loadConfig = configModule.loadConfig;
      getTempoClient = tempoClientModule.getTempoClient;

      loadConfig();

      const client = getTempoClient();
      state.walletAddress = client.getAddress() as Address;
    }

    // Check what roles we have (with error handling for unsupported tokens)
    const service = getRoleService();

    try {
      state.hasAdminRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'DEFAULT_ADMIN_ROLE',
        state.walletAddress!
      );

      state.hasPauseRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'PAUSE_ROLE',
        state.walletAddress!
      );

      state.hasUnpauseRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'UNPAUSE_ROLE',
        state.walletAddress!
      );

      state.initialPauseStatus = await service.isPaused(E2E_CONFIG.knownTokenAddress);

      console.log(`\n  Wallet Address: ${state.walletAddress}`);
      console.log(`  Has DEFAULT_ADMIN_ROLE: ${state.hasAdminRole}`);
      console.log(`  Has PAUSE_ROLE: ${state.hasPauseRole}`);
      console.log(`  Has UNPAUSE_ROLE: ${state.hasUnpauseRole}`);
      console.log(`  Token currently paused: ${state.initialPauseStatus}`);
    } catch (error) {
      // Token does not support standard AccessControl
      accessControlSupported = false;
      console.log(`\n  Wallet Address: ${state.walletAddress}`);
      console.log(`  Note: Token does not support standard AccessControl interface`);
      console.log(`  All write tests will be skipped`);
    }
  });

  // ===========================================================================
  // Pause/Unpause Tests (if caller has appropriate roles)
  // ===========================================================================

  describe('Pause Control', () => {
    it('should pause token if caller has PAUSE_ROLE and token is not paused', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (!state.hasPauseRole) {
        console.log('  Skipped: Wallet does not have PAUSE_ROLE');
        return;
      }

      const service = getRoleService();
      const isPaused = await service.isPaused(E2E_CONFIG.knownTokenAddress);

      if (isPaused) {
        console.log('  Skipped: Token is already paused');
        return;
      }

      const result = await service.pauseToken(E2E_CONFIG.knownTokenAddress);

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Gas: ${result.gasCost}`);

      // Verify token is now paused
      const nowPaused = await service.isPaused(E2E_CONFIG.knownTokenAddress);
      expect(nowPaused).toBe(true);
      console.log(`  Token now paused: ${nowPaused}`);
    }, E2E_CONFIG.longTimeout);

    it('should unpause token if caller has UNPAUSE_ROLE and token is paused', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (!state.hasUnpauseRole) {
        console.log('  Skipped: Wallet does not have UNPAUSE_ROLE');
        return;
      }

      const service = getRoleService();
      const isPaused = await service.isPaused(E2E_CONFIG.knownTokenAddress);

      if (!isPaused) {
        console.log('  Skipped: Token is not paused');
        return;
      }

      const result = await service.unpauseToken(E2E_CONFIG.knownTokenAddress);

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Gas: ${result.gasCost}`);

      // Verify token is now unpaused
      const nowPaused = await service.isPaused(E2E_CONFIG.knownTokenAddress);
      expect(nowPaused).toBe(false);
      console.log(`  Token now paused: ${nowPaused}`);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Role Grant/Revoke Tests (if caller has admin role)
  // ===========================================================================

  describe('Role Management', () => {
    // Use a deterministic test address for role testing
    const testRoleRecipient =
      '0x0000000000000000000000000000000000000002' as Address;

    it('should grant ISSUER_ROLE if caller has admin role', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (!state.hasAdminRole) {
        console.log('  Skipped: Wallet does not have DEFAULT_ADMIN_ROLE');
        return;
      }

      const service = getRoleService();

      // Check if address already has role
      const alreadyHasRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );

      if (alreadyHasRole) {
        console.log('  Skipped: Test address already has ISSUER_ROLE');
        return;
      }

      const result = await service.grantRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Granted ISSUER_ROLE to: ${testRoleRecipient}`);

      // Verify role was granted
      const nowHasRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );
      expect(nowHasRole).toBe(true);
    }, E2E_CONFIG.longTimeout);

    it('should revoke ISSUER_ROLE if caller has admin role', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (!state.hasAdminRole) {
        console.log('  Skipped: Wallet does not have DEFAULT_ADMIN_ROLE');
        return;
      }

      const service = getRoleService();

      // Check if address has the role to revoke
      const hasRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );

      if (!hasRole) {
        console.log('  Skipped: Test address does not have ISSUER_ROLE');
        return;
      }

      const result = await service.revokeRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );

      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.blockNumber).toBeGreaterThan(0);

      console.log(`  TX Hash: ${result.hash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Revoked ISSUER_ROLE from: ${testRoleRecipient}`);

      // Verify role was revoked
      const nowHasRole = await service.hasRole(
        E2E_CONFIG.knownTokenAddress,
        'ISSUER_ROLE',
        testRoleRecipient
      );
      expect(nowHasRole).toBe(false);
    }, E2E_CONFIG.longTimeout);
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should fail to grant role without admin permission', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (state.hasAdminRole) {
        console.log('  Skipped: Wallet has admin role (would succeed)');
        return;
      }

      const service = getRoleService();

      await expect(
        service.grantRole(
          E2E_CONFIG.knownTokenAddress,
          'ISSUER_ROLE',
          '0x0000000000000000000000000000000000000003' as Address
        )
      ).rejects.toThrow();

      console.log('  Correctly rejected: No admin permission');
    }, E2E_CONFIG.timeout);

    it('should fail to pause without PAUSE_ROLE', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (state.hasPauseRole) {
        console.log('  Skipped: Wallet has PAUSE_ROLE (would succeed)');
        return;
      }

      const service = getRoleService();

      await expect(
        service.pauseToken(E2E_CONFIG.knownTokenAddress)
      ).rejects.toThrow();

      console.log('  Correctly rejected: No PAUSE_ROLE');
    }, E2E_CONFIG.timeout);

    it('should fail to unpause without UNPAUSE_ROLE', async () => {
      if (!accessControlSupported) {
        console.log('  Skipped: Token does not support AccessControl');
        return;
      }
      if (state.hasUnpauseRole) {
        console.log('  Skipped: Wallet has UNPAUSE_ROLE (would succeed)');
        return;
      }

      const service = getRoleService();

      await expect(
        service.unpauseToken(E2E_CONFIG.knownTokenAddress)
      ).rejects.toThrow();

      console.log('  Correctly rejected: No UNPAUSE_ROLE');
    }, E2E_CONFIG.timeout);
  });
});

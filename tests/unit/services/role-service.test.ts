/**
 * Role Service Unit Tests
 *
 * Tests for TIP-20 role management service including:
 * - Role hash computation
 * - Role query methods (hasRole, getRoleMembers)
 * - Role modification methods (grantRole, revokeRole, renounceRole)
 * - Pause control methods (pauseToken, unpauseToken, isPaused)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_ADDRESSES,
  TEST_TOKENS,
  TEST_TX_HASHES,
} from '../../utils/test-helpers.js';
import {
  createMockTempoClient,
  setMockClient,
  resetMockClient,
} from '../../utils/mock-tempo-client.js';

// Mock the tempo client module
vi.mock('../../../src/services/tempo-client.js', async () => {
  const { getMockClient } = await import('../../utils/mock-tempo-client.js');
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
  };
});

// Mock config module
vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// Import after mocks are set up
import {
  RoleService,
  getRoleService,
  resetRoleService,
  ROLES,
  ROLE_NAMES,
} from '../../../src/services/role-service.js';

describe('RoleService', () => {
  let roleService: RoleService;

  beforeEach(() => {
    resetRoleService();
    resetMockClient();
    setMockClient(createMockTempoClient());
    roleService = getRoleService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockClient();
  });

  // ===========================================================================
  // Role Constants Tests
  // ===========================================================================

  describe('Role Constants', () => {
    it('should define all TIP-20 roles', () => {
      expect(ROLE_NAMES).toContain('DEFAULT_ADMIN_ROLE');
      expect(ROLE_NAMES).toContain('ISSUER_ROLE');
      expect(ROLE_NAMES).toContain('PAUSE_ROLE');
      expect(ROLE_NAMES).toContain('UNPAUSE_ROLE');
      expect(ROLE_NAMES).toContain('BURN_BLOCKED_ROLE');
      expect(ROLE_NAMES).toHaveLength(5);
    });

    it('should have DEFAULT_ADMIN_ROLE as zero bytes32', () => {
      expect(ROLES.DEFAULT_ADMIN_ROLE).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should have valid bytes32 hashes for all roles', () => {
      for (const role of ROLE_NAMES) {
        const hash = ROLES[role];
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      }
    });

    it('should have unique hashes for each role', () => {
      const hashes = Object.values(ROLES);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });
  });

  // ===========================================================================
  // getRoleHash Tests
  // ===========================================================================

  describe('getRoleHash', () => {
    it('should return correct hash for DEFAULT_ADMIN_ROLE', () => {
      const hash = roleService.getRoleHash('DEFAULT_ADMIN_ROLE');
      expect(hash).toBe(ROLES.DEFAULT_ADMIN_ROLE);
    });

    it('should return correct hash for ISSUER_ROLE', () => {
      const hash = roleService.getRoleHash('ISSUER_ROLE');
      expect(hash).toBe(ROLES.ISSUER_ROLE);
    });

    it('should return correct hash for all roles', () => {
      for (const role of ROLE_NAMES) {
        const hash = roleService.getRoleHash(role);
        expect(hash).toBe(ROLES[role]);
      }
    });
  });

  // ===========================================================================
  // hasRole Tests
  // ===========================================================================

  describe('hasRole', () => {
    it('should return true when address has role', async () => {
      setMockClient(createMockTempoClient({ hasRole: true }));
      roleService = new RoleService();

      const result = await roleService.hasRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE',
        TEST_ADDRESSES.VALID as `0x${string}`
      );

      expect(result).toBe(true);
    });

    it('should return false when address does not have role', async () => {
      setMockClient(createMockTempoClient({ hasRole: false }));
      roleService = new RoleService();

      const result = await roleService.hasRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should query the correct token contract', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.hasRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'DEFAULT_ADMIN_ROLE',
        TEST_ADDRESSES.VALID as `0x${string}`
      );

      expect(mockClient.publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: TEST_TOKENS.ALPHA_USD,
          functionName: 'hasRole',
        })
      );
    });
  });

  // ===========================================================================
  // getRoleMembers Tests
  // ===========================================================================

  describe('getRoleMembers', () => {
    it('should return empty array when no members', async () => {
      setMockClient(createMockTempoClient({ roleMembers: {} }));
      roleService = new RoleService();

      const members = await roleService.getRoleMembers(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'BURN_BLOCKED_ROLE'
      );

      expect(members).toEqual([]);
    });

    it('should return all members of a role', async () => {
      const issuerRoleHash = ROLES.ISSUER_ROLE;
      const expectedMembers = [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2];

      setMockClient(
        createMockTempoClient({
          roleMembers: { [issuerRoleHash]: expectedMembers },
        })
      );
      roleService = new RoleService();

      const members = await roleService.getRoleMembers(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE'
      );

      expect(members).toHaveLength(2);
      expect(members).toContain(TEST_ADDRESSES.VALID);
      expect(members).toContain(TEST_ADDRESSES.VALID_2);
    });
  });

  // ===========================================================================
  // getRoleMemberCount Tests
  // ===========================================================================

  describe('getRoleMemberCount', () => {
    it('should return zero for role with no members', async () => {
      setMockClient(createMockTempoClient({ roleMembers: {} }));
      roleService = new RoleService();

      const count = await roleService.getRoleMemberCount(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'BURN_BLOCKED_ROLE'
      );

      expect(count).toBe(0);
    });

    it('should return correct count for role with members', async () => {
      const adminRoleHash = ROLES.DEFAULT_ADMIN_ROLE;
      setMockClient(
        createMockTempoClient({
          roleMembers: {
            [adminRoleHash]: [
              TEST_ADDRESSES.VALID,
              TEST_ADDRESSES.VALID_2,
              TEST_ADDRESSES.VALID_3,
            ],
          },
        })
      );
      roleService = new RoleService();

      const count = await roleService.getRoleMemberCount(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'DEFAULT_ADMIN_ROLE'
      );

      expect(count).toBe(3);
    });
  });

  // ===========================================================================
  // getTokenRolesInfo Tests
  // ===========================================================================

  describe('getTokenRolesInfo', () => {
    it('should return complete role information', async () => {
      const adminHash = ROLES.DEFAULT_ADMIN_ROLE;
      const issuerHash = ROLES.ISSUER_ROLE;

      setMockClient(
        createMockTempoClient({
          isPaused: false,
          roleMembers: {
            [adminHash]: [TEST_ADDRESSES.VALID],
            [issuerHash]: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
          },
        })
      );
      roleService = new RoleService();

      const info = await roleService.getTokenRolesInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(info.token).toBe(TEST_TOKENS.ALPHA_USD);
      expect(info.isPaused).toBe(false);
      expect(info.roles.DEFAULT_ADMIN_ROLE.count).toBe(1);
      expect(info.roles.ISSUER_ROLE.count).toBe(2);
    });

    it('should reflect paused status', async () => {
      setMockClient(createMockTempoClient({ isPaused: true }));
      roleService = new RoleService();

      const info = await roleService.getTokenRolesInfo(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(info.isPaused).toBe(true);
    });
  });

  // ===========================================================================
  // grantRole Tests
  // ===========================================================================

  describe('grantRole', () => {
    it('should successfully grant a role', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      const result = await roleService.grantRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.gasCost).toBeDefined();
    });

    it('should call writeContract with correct arguments', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.grantRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'PAUSE_ROLE',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: TEST_TOKENS.ALPHA_USD,
          functionName: 'grantRole',
        })
      );
    });

    it('should throw on access denied error', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'writeContract',
          failMessage: 'AccessControlUnauthorizedAccount',
        })
      );
      roleService = new RoleService();

      await expect(
        roleService.grantRole(
          TEST_TOKENS.ALPHA_USD as `0x${string}`,
          'ISSUER_ROLE',
          TEST_ADDRESSES.VALID_2 as `0x${string}`
        )
      ).rejects.toThrow(/Transaction reverted/);
    });
  });

  // ===========================================================================
  // revokeRole Tests
  // ===========================================================================

  describe('revokeRole', () => {
    it('should successfully revoke a role', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      const result = await roleService.revokeRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should call writeContract with correct function', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.revokeRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'PAUSE_ROLE',
        TEST_ADDRESSES.VALID_2 as `0x${string}`
      );

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'revokeRole',
        })
      );
    });
  });

  // ===========================================================================
  // renounceRole Tests
  // ===========================================================================

  describe('renounceRole', () => {
    it('should successfully renounce own role', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      const result = await roleService.renounceRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'ISSUER_ROLE'
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
    });

    it('should call writeContract with renounceRole function', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.renounceRole(
        TEST_TOKENS.ALPHA_USD as `0x${string}`,
        'PAUSE_ROLE'
      );

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'renounceRole',
        })
      );
    });
  });

  // ===========================================================================
  // isPaused Tests
  // ===========================================================================

  describe('isPaused', () => {
    it('should return false when token is not paused', async () => {
      setMockClient(createMockTempoClient({ isPaused: false }));
      roleService = new RoleService();

      const result = await roleService.isPaused(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(false);
    });

    it('should return true when token is paused', async () => {
      setMockClient(createMockTempoClient({ isPaused: true }));
      roleService = new RoleService();

      const result = await roleService.isPaused(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // pauseToken Tests
  // ===========================================================================

  describe('pauseToken', () => {
    it('should successfully pause token', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      const result = await roleService.pauseToken(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
      expect(result.blockNumber).toBeGreaterThan(0);
    });

    it('should call writeContract with pause function', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.pauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`);

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'pause',
        })
      );
    });

    it('should throw when token is already paused', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'writeContract',
          failMessage: 'EnforcedPause',
        })
      );
      roleService = new RoleService();

      await expect(
        roleService.pauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow(/Transaction reverted/);
    });

    it('should throw when caller lacks PAUSE_ROLE', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'writeContract',
          failMessage: 'AccessControlUnauthorizedAccount',
        })
      );
      roleService = new RoleService();

      await expect(
        roleService.pauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow(/Transaction reverted/);
    });
  });

  // ===========================================================================
  // unpauseToken Tests
  // ===========================================================================

  describe('unpauseToken', () => {
    it('should successfully unpause token', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      const result = await roleService.unpauseToken(
        TEST_TOKENS.ALPHA_USD as `0x${string}`
      );

      expect(result.hash).toBe(TEST_TX_HASHES.VALID);
    });

    it('should call writeContract with unpause function', async () => {
      const mockClient = createMockTempoClient();
      setMockClient(mockClient);
      roleService = new RoleService();

      await roleService.unpauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`);

      expect(mockClient.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'unpause',
        })
      );
    });

    it('should throw when token is not paused', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'writeContract',
          failMessage: 'ExpectedPause',
        })
      );
      roleService = new RoleService();

      await expect(
        roleService.unpauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow(/Transaction reverted/);
    });

    it('should throw when caller lacks UNPAUSE_ROLE', async () => {
      setMockClient(
        createMockTempoClient({
          shouldFail: true,
          failOnMethod: 'writeContract',
          failMessage: 'AccessControlUnauthorizedAccount',
        })
      );
      roleService = new RoleService();

      await expect(
        roleService.unpauseToken(TEST_TOKENS.ALPHA_USD as `0x${string}`)
      ).rejects.toThrow(/Transaction reverted/);
    });
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getRoleService();
      const instance2 = getRoleService();
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getRoleService();
      resetRoleService();
      const instance2 = getRoleService();
      expect(instance1).not.toBe(instance2);
    });
  });
});

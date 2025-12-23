/**
 * Role Service
 *
 * Service layer for TIP-20 token role management operations.
 * Provides methods for querying and modifying role-based access control
 * on TIP-20 tokens, as well as emergency pause/unpause functionality.
 *
 * TIP-20 Predefined Roles:
 * - DEFAULT_ADMIN_ROLE: Can grant/revoke all roles
 * - ISSUER_ROLE: Can mint and burn tokens
 * - PAUSE_ROLE: Can pause all transfers
 * - UNPAUSE_ROLE: Can resume transfers after pause
 * - BURN_BLOCKED_ROLE: Can burn tokens from blocked addresses
 */

import { type Address, type Hash, keccak256, toHex } from 'viem';
import { getTempoClient, type TempoPublicClient } from './tempo-client.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Role Constants
// =============================================================================

/**
 * TIP-20 role name type.
 */
export type RoleName =
  | 'DEFAULT_ADMIN_ROLE'
  | 'ISSUER_ROLE'
  | 'PAUSE_ROLE'
  | 'UNPAUSE_ROLE'
  | 'BURN_BLOCKED_ROLE';

/**
 * Role name to bytes32 hash mapping.
 *
 * DEFAULT_ADMIN_ROLE is always 0x00...00 (OpenZeppelin convention).
 * Other roles are keccak256 hashes of the role name string.
 */
export const ROLES: Record<RoleName, `0x${string}`> = {
  DEFAULT_ADMIN_ROLE:
    '0x0000000000000000000000000000000000000000000000000000000000000000',
  ISSUER_ROLE: keccak256(toHex('ISSUER_ROLE')),
  PAUSE_ROLE: keccak256(toHex('PAUSE_ROLE')),
  UNPAUSE_ROLE: keccak256(toHex('UNPAUSE_ROLE')),
  BURN_BLOCKED_ROLE: keccak256(toHex('BURN_BLOCKED_ROLE')),
} as const;

/**
 * Array of all role names for validation.
 */
export const ROLE_NAMES: readonly RoleName[] = [
  'DEFAULT_ADMIN_ROLE',
  'ISSUER_ROLE',
  'PAUSE_ROLE',
  'UNPAUSE_ROLE',
  'BURN_BLOCKED_ROLE',
] as const;

// =============================================================================
// ABI Definitions
// =============================================================================

/**
 * OpenZeppelin AccessControlEnumerable ABI subset.
 * Used for role management on TIP-20 tokens.
 */
export const ACCESS_CONTROL_ABI = [
  // Grant a role to an account (requires admin role)
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Revoke a role from an account (requires admin role)
  {
    name: 'revokeRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Renounce your own role (caller must have the role)
  {
    name: 'renounceRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'callerConfirmation', type: 'address' },
    ],
    outputs: [],
  },
  // Check if an account has a role
  // NOTE: Tempo TIP-20 uses non-standard order: (account, role) instead of (role, account)
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'role', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Get the number of accounts with a role
  {
    name: 'getRoleMemberCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'role', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Get the account at index for a role
  {
    name: 'getRoleMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  // Get the admin role that controls a given role
  {
    name: 'getRoleAdmin',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'role', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  // RoleGranted event
  {
    name: 'RoleGranted',
    type: 'event',
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
    ],
  },
  // RoleRevoked event
  {
    name: 'RoleRevoked',
    type: 'event',
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * OpenZeppelin Pausable ABI subset.
 * Used for emergency pause functionality on TIP-20 tokens.
 */
export const PAUSABLE_ABI = [
  // Pause all token transfers
  {
    name: 'pause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Unpause token transfers
  {
    name: 'unpause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Check if token is paused
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Paused event
  {
    name: 'Paused',
    type: 'event',
    inputs: [{ name: 'account', type: 'address', indexed: false }],
  },
  // Unpaused event
  {
    name: 'Unpaused',
    type: 'event',
    inputs: [{ name: 'account', type: 'address', indexed: false }],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

/** Result of a role operation with transaction details */
export interface RoleOperationResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

/** Information about all roles for a token */
export interface TokenRolesInfo {
  token: Address;
  roles: Record<
    RoleName,
    {
      members: Address[];
      count: number;
    }
  >;
  isPaused: boolean;
}

// =============================================================================
// RoleService Class
// =============================================================================

/**
 * Service for managing TIP-20 token roles.
 *
 * Provides methods for:
 * - Checking role assignments (hasRole, getRoleMembers)
 * - Modifying role assignments (grantRole, revokeRole, renounceRole)
 * - Emergency pause control (pauseToken, unpauseToken, isPaused)
 *
 * @example
 * ```typescript
 * const roleService = getRoleService();
 *
 * // Check if address has role
 * const hasIssuer = await roleService.hasRole(tokenAddress, 'ISSUER_ROLE', account);
 *
 * // Grant role
 * const result = await roleService.grantRole(tokenAddress, 'ISSUER_ROLE', account);
 * console.log('Transaction:', result.hash);
 * ```
 */
export class RoleService {
  private readonly client = getTempoClient();

  /**
   * Get the public client for read operations.
   */
  private get publicClient(): TempoPublicClient {
    return this.client['publicClient'];
  }

  /**
   * Get the fee token for transaction gas payment.
   */
  private get feeToken(): Address {
    return this.client['feeToken'];
  }

  // ===========================================================================
  // Role Query Methods
  // ===========================================================================

  /**
   * Get the bytes32 hash for a role name.
   *
   * @param roleName - The role name
   * @returns The bytes32 role hash
   */
  getRoleHash(roleName: RoleName): `0x${string}` {
    return ROLES[roleName];
  }

  /**
   * Check if an account has a specific role on a token.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to check
   * @param account - Account to check
   * @returns True if account has the role
   */
  async hasRole(
    tokenAddress: Address,
    roleName: RoleName,
    account: Address
  ): Promise<boolean> {
    const roleHash = this.getRoleHash(roleName);

    // NOTE: Tempo TIP-20 uses (account, role) order instead of standard (role, account)
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ACCESS_CONTROL_ABI,
      functionName: 'hasRole',
      args: [account, roleHash],
    });

    return result as boolean;
  }

  /**
   * Get the number of accounts with a specific role.
   *
   * Note: This requires IAccessControlEnumerable which may not be supported
   * by all TIP-20 tokens on Tempo.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to count
   * @returns Number of accounts with the role
   * @throws Error if role enumeration is not supported
   */
  async getRoleMemberCount(
    tokenAddress: Address,
    roleName: RoleName
  ): Promise<number> {
    const roleHash = this.getRoleHash(roleName);

    try {
      const count = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'getRoleMemberCount',
        args: [roleHash],
      });

      return Number(count);
    } catch (error) {
      // Check if this is because the function doesn't exist (not IAccessControlEnumerable)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('getRoleMemberCount')) {
        throw new Error(
          'Role enumeration is not supported by this token. ' +
          'The token implements IAccessControl but not IAccessControlEnumerable. ' +
          'Use has_role to check if a specific address has a role instead.'
        );
      }
      throw error;
    }
  }

  /**
   * Get all accounts with a specific role.
   *
   * Note: This requires IAccessControlEnumerable which may not be supported
   * by all TIP-20 tokens on Tempo.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to query
   * @returns Array of addresses with the role
   * @throws Error if role enumeration is not supported
   */
  async getRoleMembers(
    tokenAddress: Address,
    roleName: RoleName
  ): Promise<Address[]> {
    const roleHash = this.getRoleHash(roleName);

    // First get the count - this will throw a helpful error if not supported
    const memberCount = await this.getRoleMemberCount(tokenAddress, roleName);

    if (memberCount === 0) {
      return [];
    }

    // Fetch all members in parallel for efficiency
    const memberPromises: Promise<Address>[] = [];
    for (let i = 0; i < memberCount; i++) {
      memberPromises.push(
        this.publicClient
          .readContract({
            address: tokenAddress,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'getRoleMember',
            args: [roleHash, BigInt(i)],
          })
          .then((result) => result as Address)
      );
    }

    return Promise.all(memberPromises);
  }

  /**
   * Get complete role information for a token.
   *
   * Queries all roles and their members, plus pause status.
   * If the token doesn't support IAccessControlEnumerable, returns empty member arrays.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Complete role information
   */
  async getTokenRolesInfo(tokenAddress: Address): Promise<TokenRolesInfo> {
    // Try to fetch all roles in parallel
    // If enumeration is not supported, we'll return empty arrays
    let defaultAdminMembers: Address[] = [];
    let issuerMembers: Address[] = [];
    let pauseMembers: Address[] = [];
    let unpauseMembers: Address[] = [];
    let burnBlockedMembers: Address[] = [];
    let enumerationSupported = true;

    try {
      const results = await Promise.all([
        this.getRoleMembers(tokenAddress, 'DEFAULT_ADMIN_ROLE'),
        this.getRoleMembers(tokenAddress, 'ISSUER_ROLE'),
        this.getRoleMembers(tokenAddress, 'PAUSE_ROLE'),
        this.getRoleMembers(tokenAddress, 'UNPAUSE_ROLE'),
        this.getRoleMembers(tokenAddress, 'BURN_BLOCKED_ROLE'),
      ]);
      [defaultAdminMembers, issuerMembers, pauseMembers, unpauseMembers, burnBlockedMembers] = results;
    } catch (error) {
      // If enumeration is not supported, continue with empty arrays
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('enumeration is not supported')) {
        enumerationSupported = false;
      } else {
        throw error;
      }
    }

    // Always try to get pause status (this should work)
    const isPaused = await this.isPaused(tokenAddress);

    return {
      token: tokenAddress,
      roles: {
        DEFAULT_ADMIN_ROLE: {
          members: defaultAdminMembers,
          count: defaultAdminMembers.length,
        },
        ISSUER_ROLE: {
          members: issuerMembers,
          count: issuerMembers.length,
        },
        PAUSE_ROLE: {
          members: pauseMembers,
          count: pauseMembers.length,
        },
        UNPAUSE_ROLE: {
          members: unpauseMembers,
          count: unpauseMembers.length,
        },
        BURN_BLOCKED_ROLE: {
          members: burnBlockedMembers,
          count: burnBlockedMembers.length,
        },
      },
      isPaused,
    };
  }

  // ===========================================================================
  // Role Modification Methods
  // ===========================================================================

  /**
   * Grant a role to an account.
   *
   * Requires the caller to have the admin role for the target role
   * (typically DEFAULT_ADMIN_ROLE).
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to grant
   * @param account - Account to grant role to
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async grantRole(
    tokenAddress: Address,
    roleName: RoleName,
    account: Address
  ): Promise<RoleOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const roleHash = this.getRoleHash(roleName);

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'grantRole',
        args: [roleHash, account],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      // Check for common revert reasons
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('AccessControlUnauthorizedAccount') ||
        errorMessage.includes('missing role')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller does not have admin role to grant ${roleName}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Revoke a role from an account.
   *
   * Requires the caller to have the admin role for the target role
   * (typically DEFAULT_ADMIN_ROLE).
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to revoke
   * @param account - Account to revoke role from
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async revokeRole(
    tokenAddress: Address,
    roleName: RoleName,
    account: Address
  ): Promise<RoleOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const roleHash = this.getRoleHash(roleName);

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'revokeRole',
        args: [roleHash, account],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('AccessControlUnauthorizedAccount') ||
        errorMessage.includes('missing role')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller does not have admin role to revoke ${roleName}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Renounce your own role.
   *
   * The caller must be the account renouncing the role.
   * This is a safety feature to prevent accidental renunciation.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param roleName - Role to renounce
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async renounceRole(
    tokenAddress: Address,
    roleName: RoleName
  ): Promise<RoleOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const callerAddress = this.client.getAddress();
    const roleHash = this.getRoleHash(roleName);

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'renounceRole',
        args: [roleHash, callerAddress],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('AccessControlBadConfirmation')) {
        throw BlockchainError.transactionReverted(
          `Cannot renounce role: caller confirmation mismatch. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Pause Control Methods
  // ===========================================================================

  /**
   * Check if a token is paused.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns True if token is paused
   */
  async isPaused(tokenAddress: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: PAUSABLE_ABI,
      functionName: 'paused',
      args: [],
    });

    return result as boolean;
  }

  /**
   * Pause all token transfers.
   *
   * Requires the caller to have PAUSE_ROLE on the token.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Transaction result
   * @throws Error if wallet not configured, no PAUSE_ROLE, or already paused
   */
  async pauseToken(tokenAddress: Address): Promise<RoleOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: PAUSABLE_ABI,
        functionName: 'pause',
        args: [],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('EnforcedPause')) {
        throw BlockchainError.transactionReverted(
          `Token is already paused. ${errorMessage}`
        );
      }
      if (
        errorMessage.includes('AccessControlUnauthorizedAccount') ||
        errorMessage.includes('missing role')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller does not have PAUSE_ROLE. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Unpause token transfers.
   *
   * Requires the caller to have UNPAUSE_ROLE on the token.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Transaction result
   * @throws Error if wallet not configured, no UNPAUSE_ROLE, or not paused
   */
  async unpauseToken(tokenAddress: Address): Promise<RoleOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: PAUSABLE_ABI,
        functionName: 'unpause',
        args: [],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('ExpectedPause')) {
        throw BlockchainError.transactionReverted(
          `Token is not paused. ${errorMessage}`
        );
      }
      if (
        errorMessage.includes('AccessControlUnauthorizedAccount') ||
        errorMessage.includes('missing role')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller does not have UNPAUSE_ROLE. ${errorMessage}`
        );
      }
      throw error;
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: RoleService | null = null;

/**
 * Get or create the singleton RoleService instance.
 *
 * @returns The shared RoleService instance
 */
export function getRoleService(): RoleService {
  if (!serviceInstance) {
    serviceInstance = new RoleService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetRoleService(): void {
  serviceInstance = null;
}

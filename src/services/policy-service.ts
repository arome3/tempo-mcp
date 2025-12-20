/**
 * Policy Service
 *
 * Service layer for TIP-403 Policy Registry operations.
 * Provides methods for compliance infrastructure including whitelist/blacklist
 * management and pre-transfer validation.
 *
 * TIP-403 enables token issuers to enforce transfer restrictions:
 * - Whitelist: Only approved addresses can send/receive
 * - Blacklist: All addresses can transact except blocked ones
 *
 * Policy Registry Contract: 0x403c000000000000000000000000000000000000
 */

import { type Address, type Hash, formatUnits } from 'viem';
import { getTempoClient, type TempoPublicClient } from './tempo-client.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * TIP-403 Policy Registry contract address.
 */
export const POLICY_REGISTRY_ADDRESS =
  '0x403c000000000000000000000000000000000000' as Address;

/**
 * Policy type enumeration.
 */
export type PolicyType = 'whitelist' | 'blacklist' | 'none';

/**
 * Policy type numeric values from contract.
 */
export const POLICY_TYPE_VALUES: Record<number, PolicyType> = {
  0: 'none',
  1: 'whitelist',
  2: 'blacklist',
};

// =============================================================================
// ABI Definitions
// =============================================================================

/**
 * TIP-403 Policy Registry ABI.
 * Used for compliance checks and list management.
 */
export const POLICY_REGISTRY_ABI = [
  // Check if a transfer is allowed by policy
  {
    name: 'canTransfer',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Check if address is on whitelist
  {
    name: 'isWhitelisted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Check if address is on blacklist
  {
    name: 'isBlacklisted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Get policy details
  {
    name: 'getPolicy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'policyId', type: 'uint256' }],
    outputs: [
      { name: 'policyType', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'tokenCount', type: 'uint256' },
    ],
  },
  // Add address to whitelist
  {
    name: 'addToWhitelist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Remove address from whitelist
  {
    name: 'removeFromWhitelist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Add address to blacklist (block)
  {
    name: 'addToBlacklist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Remove address from blacklist (unblock)
  {
    name: 'removeFromBlacklist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  // Events
  {
    name: 'AddressWhitelisted',
    type: 'event',
    inputs: [
      { name: 'policyId', type: 'uint256', indexed: true },
      { name: 'account', type: 'address', indexed: true },
    ],
  },
  {
    name: 'AddressBlacklisted',
    type: 'event',
    inputs: [
      { name: 'policyId', type: 'uint256', indexed: true },
      { name: 'account', type: 'address', indexed: true },
    ],
  },
  {
    name: 'AddressRemovedFromWhitelist',
    type: 'event',
    inputs: [
      { name: 'policyId', type: 'uint256', indexed: true },
      { name: 'account', type: 'address', indexed: true },
    ],
  },
  {
    name: 'AddressRemovedFromBlacklist',
    type: 'event',
    inputs: [
      { name: 'policyId', type: 'uint256', indexed: true },
      { name: 'account', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * TIP-20 policy-related methods ABI.
 * Used for getting token's associated policy and burning blocked funds.
 */
export const TIP20_POLICY_ABI = [
  // Get the policy address for a token
  {
    name: 'policy',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Get the policy ID for a token
  {
    name: 'policyId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Burn tokens from a blocked address (requires BURN_BLOCKED_ROLE)
  {
    name: 'burnBlocked',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'blockedAddress', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  // Standard balance query for getting blocked address balance
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Decimals for amount formatting
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

/** Result of a policy write operation with transaction details */
export interface PolicyOperationResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

/** Policy information */
export interface PolicyInfo {
  policyId: number;
  policyType: PolicyType;
  owner: Address;
  tokenCount: number;
}

/** Transfer compliance check result */
export interface TransferComplianceResult {
  allowed: boolean;
  policyId: number | null;
  policyType: PolicyType;
  fromStatus: {
    isWhitelisted: boolean;
    isBlacklisted: boolean;
  };
  toStatus: {
    isWhitelisted: boolean;
    isBlacklisted: boolean;
  };
  reason: string | null;
}

// =============================================================================
// PolicyService Class
// =============================================================================

/**
 * Service for managing TIP-403 policy compliance.
 *
 * Provides methods for:
 * - Checking transfer compliance (canTransfer, isWhitelisted, isBlacklisted)
 * - Managing whitelist/blacklist entries (add/remove operations)
 * - Burning tokens from blocked addresses (burnBlocked)
 * - Querying policy information
 *
 * @example
 * ```typescript
 * const policyService = getPolicyService();
 *
 * // Check if transfer is allowed
 * const canSend = await policyService.canTransfer(token, from, to);
 *
 * // Add address to blacklist
 * const result = await policyService.addToBlacklist(policyId, account);
 * console.log('Transaction:', result.hash);
 * ```
 */
export class PolicyService {
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
  // Transfer Compliance Methods
  // ===========================================================================

  /**
   * Check if a transfer is allowed by the token's policy.
   *
   * This is the primary compliance check that should be called before
   * any transfer to ensure it will succeed.
   *
   * @param token - TIP-20 token address
   * @param from - Sender address
   * @param to - Recipient address
   * @returns True if the transfer is allowed
   */
  async canTransfer(
    token: Address,
    from: Address,
    to: Address
  ): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: POLICY_REGISTRY_ADDRESS,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'canTransfer',
      args: [token, from, to],
    });

    return result as boolean;
  }

  /**
   * Get comprehensive transfer compliance information.
   *
   * Returns detailed compliance status including policy type and
   * individual address statuses for debugging and reporting.
   *
   * @param token - TIP-20 token address
   * @param from - Sender address
   * @param to - Recipient address
   * @returns Detailed compliance check result
   */
  async checkTransferCompliance(
    token: Address,
    from: Address,
    to: Address
  ): Promise<TransferComplianceResult> {
    // Get the token's policy ID
    const policyId = await this.getTokenPolicyId(token);

    if (policyId === null) {
      // No policy assigned - all transfers allowed
      return {
        allowed: true,
        policyId: null,
        policyType: 'none',
        fromStatus: { isWhitelisted: false, isBlacklisted: false },
        toStatus: { isWhitelisted: false, isBlacklisted: false },
        reason: null,
      };
    }

    // Get policy info and check statuses in parallel
    const [allowed, policyInfo, fromWhitelisted, fromBlacklisted, toWhitelisted, toBlacklisted] =
      await Promise.all([
        this.canTransfer(token, from, to),
        this.getPolicy(policyId),
        this.isWhitelisted(policyId, from),
        this.isBlacklisted(policyId, from),
        this.isWhitelisted(policyId, to),
        this.isBlacklisted(policyId, to),
      ]);

    // Determine rejection reason if not allowed
    let reason: string | null = null;
    if (!allowed) {
      if (policyInfo.policyType === 'whitelist') {
        if (!fromWhitelisted) {
          reason = `Sender ${from} is not whitelisted`;
        } else if (!toWhitelisted) {
          reason = `Recipient ${to} is not whitelisted`;
        }
      } else if (policyInfo.policyType === 'blacklist') {
        if (fromBlacklisted) {
          reason = `Sender ${from} is blacklisted`;
        } else if (toBlacklisted) {
          reason = `Recipient ${to} is blacklisted`;
        }
      }
      if (!reason) {
        reason = 'Transfer blocked by policy';
      }
    }

    return {
      allowed,
      policyId,
      policyType: policyInfo.policyType,
      fromStatus: {
        isWhitelisted: fromWhitelisted,
        isBlacklisted: fromBlacklisted,
      },
      toStatus: {
        isWhitelisted: toWhitelisted,
        isBlacklisted: toBlacklisted,
      },
      reason,
    };
  }

  // ===========================================================================
  // Whitelist Query Methods
  // ===========================================================================

  /**
   * Check if an address is on the whitelist for a policy.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to check
   * @returns True if address is whitelisted
   */
  async isWhitelisted(policyId: number, account: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: POLICY_REGISTRY_ADDRESS,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'isWhitelisted',
      args: [BigInt(policyId), account],
    });

    return result as boolean;
  }

  /**
   * Check if an address is on the blacklist for a policy.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to check
   * @returns True if address is blacklisted
   */
  async isBlacklisted(policyId: number, account: Address): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: POLICY_REGISTRY_ADDRESS,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'isBlacklisted',
      args: [BigInt(policyId), account],
    });

    return result as boolean;
  }

  // ===========================================================================
  // Policy Query Methods
  // ===========================================================================

  /**
   * Get policy information by ID.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @returns Policy details including type, owner, and token count
   */
  async getPolicy(policyId: number): Promise<PolicyInfo> {
    const result = await this.publicClient.readContract({
      address: POLICY_REGISTRY_ADDRESS,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'getPolicy',
      args: [BigInt(policyId)],
    });

    const [policyTypeNum, owner, tokenCount] = result as [number, Address, bigint];

    return {
      policyId,
      policyType: POLICY_TYPE_VALUES[policyTypeNum] || 'none',
      owner,
      tokenCount: Number(tokenCount),
    };
  }

  /**
   * Get the policy ID associated with a token.
   *
   * @param token - TIP-20 token address
   * @returns Policy ID or null if no policy is assigned
   */
  async getTokenPolicyId(token: Address): Promise<number | null> {
    try {
      const result = await this.publicClient.readContract({
        address: token,
        abi: TIP20_POLICY_ABI,
        functionName: 'policyId',
        args: [],
      });

      const policyId = Number(result);
      return policyId > 0 ? policyId : null;
    } catch {
      // Token may not have a policy assigned
      return null;
    }
  }

  /**
   * Get the policy address associated with a token.
   *
   * @param token - TIP-20 token address
   * @returns Policy address or null if no policy is assigned
   */
  async getTokenPolicyAddress(token: Address): Promise<Address | null> {
    try {
      const result = await this.publicClient.readContract({
        address: token,
        abi: TIP20_POLICY_ABI,
        functionName: 'policy',
        args: [],
      });

      const policyAddress = result as Address;
      // Check for zero address (no policy)
      if (
        policyAddress === '0x0000000000000000000000000000000000000000'
      ) {
        return null;
      }
      return policyAddress;
    } catch {
      // Token may not have policy() function
      return null;
    }
  }

  // ===========================================================================
  // Whitelist Management Methods
  // ===========================================================================

  /**
   * Add an address to a policy's whitelist.
   *
   * Requires the caller to be the policy admin/owner.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to add to whitelist
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async addToWhitelist(
    policyId: number,
    account: Address
  ): Promise<PolicyOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'addToWhitelist',
        args: [BigInt(policyId), account],
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
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller is not authorized to modify policy ${policyId}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Remove an address from a policy's whitelist.
   *
   * Requires the caller to be the policy admin/owner.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to remove from whitelist
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async removeFromWhitelist(
    policyId: number,
    account: Address
  ): Promise<PolicyOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'removeFromWhitelist',
        args: [BigInt(policyId), account],
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
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller is not authorized to modify policy ${policyId}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Blacklist Management Methods
  // ===========================================================================

  /**
   * Add an address to a policy's blacklist (block the address).
   *
   * Requires the caller to be the policy admin/owner.
   * This is typically used for sanctions compliance.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to add to blacklist
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async addToBlacklist(
    policyId: number,
    account: Address
  ): Promise<PolicyOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'addToBlacklist',
        args: [BigInt(policyId), account],
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
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller is not authorized to modify policy ${policyId}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Remove an address from a policy's blacklist (unblock the address).
   *
   * Requires the caller to be the policy admin/owner.
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to remove from blacklist
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async removeFromBlacklist(
    policyId: number,
    account: Address
  ): Promise<PolicyOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'removeFromBlacklist',
        args: [BigInt(policyId), account],
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
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller is not authorized to modify policy ${policyId}. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Token Compliance Methods
  // ===========================================================================

  /**
   * Burn tokens from a blocked address.
   *
   * This is a compliance action that requires BURN_BLOCKED_ROLE on the token.
   * Used when funds must be seized from a sanctioned address.
   *
   * @param token - TIP-20 token address
   * @param blockedAddress - Address whose tokens to burn
   * @param amount - Amount to burn in wei, or null to burn entire balance
   * @returns Transaction result including amount burned
   * @throws Error if wallet not configured, no BURN_BLOCKED_ROLE, or address not blocked
   */
  async burnBlocked(
    token: Address,
    blockedAddress: Address,
    amount: bigint | null
  ): Promise<PolicyOperationResult & { amountBurned: string; amountBurnedFormatted: string }> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // If amount is null, get the full balance
    let burnAmount = amount;
    if (burnAmount === null) {
      const balance = await this.publicClient.readContract({
        address: token,
        abi: TIP20_POLICY_ABI,
        functionName: 'balanceOf',
        args: [blockedAddress],
      });
      burnAmount = balance as bigint;
    }

    // Get decimals for formatting
    const decimals = await this.publicClient.readContract({
      address: token,
      abi: TIP20_POLICY_ABI,
      functionName: 'decimals',
      args: [],
    });

    try {
      const hash = await walletClient.writeContract({
        address: token,
        abi: TIP20_POLICY_ABI,
        functionName: 'burnBlocked',
        args: [blockedAddress, burnAmount],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        amountBurned: burnAmount.toString(),
        amountBurnedFormatted: formatUnits(burnAmount, decimals as number),
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('AccessControlUnauthorizedAccount') ||
        errorMessage.includes('missing role') ||
        errorMessage.includes('BURN_BLOCKED_ROLE')
      ) {
        throw BlockchainError.transactionReverted(
          `Access denied: caller does not have BURN_BLOCKED_ROLE. ${errorMessage}`
        );
      }
      if (
        errorMessage.includes('not blocked') ||
        errorMessage.includes('not blacklisted')
      ) {
        throw BlockchainError.transactionReverted(
          `Cannot burn: address ${blockedAddress} is not blocked. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Get the balance of a token for an address.
   *
   * @param token - TIP-20 token address
   * @param account - Address to check balance for
   * @returns Balance in wei
   */
  async getBalance(token: Address, account: Address): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: token,
      abi: TIP20_POLICY_ABI,
      functionName: 'balanceOf',
      args: [account],
    });

    return result as bigint;
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: PolicyService | null = null;

/**
 * Get or create the singleton PolicyService instance.
 *
 * @returns The shared PolicyService instance
 */
export function getPolicyService(): PolicyService {
  if (!serviceInstance) {
    serviceInstance = new PolicyService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetPolicyService(): void {
  serviceInstance = null;
}

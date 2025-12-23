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

import { type Address, type Hash, formatUnits, decodeEventLog } from 'viem';
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
 * Per TIP-403 spec: enum PolicyType { WHITELIST, BLACKLIST }
 * So: 0 = whitelist, 1 = blacklist
 */
export const POLICY_TYPE_VALUES: Record<number, PolicyType> = {
  0: 'whitelist',
  1: 'blacklist',
};

// =============================================================================
// ABI Definitions
// =============================================================================

/**
 * TIP-403 Policy Registry ABI.
 * Based on the TIP-403 specification at https://docs.tempo.xyz/protocol/tip403/spec
 *
 * Built-in policies:
 * - policyId = 0: Always rejects transfers
 * - policyId = 1: Always allows transfers (default for new tokens)
 * - Custom policies start at policyId = 2
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
  // Check if an address is authorized under a policy
  {
    name: 'isAuthorized',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'policyId', type: 'uint64' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Get policy data (type and admin)
  {
    name: 'policyData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'policyId', type: 'uint64' }],
    outputs: [
      { name: 'policyType', type: 'uint8' },
      { name: 'admin', type: 'address' },
    ],
  },
  // Check if a policy exists
  {
    name: 'policyExists',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'policyId', type: 'uint64' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Get the next available policy ID
  {
    name: 'policyIdCounter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  // Create a new empty policy
  {
    name: 'createPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'policyType', type: 'uint8' },
    ],
    outputs: [{ name: 'policyId', type: 'uint64' }],
  },
  // Create a policy with initial accounts
  {
    name: 'createPolicyWithAccounts',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'policyType', type: 'uint8' },
      { name: 'accounts', type: 'address[]' },
    ],
    outputs: [{ name: 'policyId', type: 'uint64' }],
  },
  // Set a new admin for a policy
  {
    name: 'setPolicyAdmin',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint64' },
      { name: 'admin', type: 'address' },
    ],
    outputs: [],
  },
  // Modify whitelist entry (add/remove)
  {
    name: 'modifyPolicyWhitelist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint64' },
      { name: 'account', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  // Modify blacklist entry (add/remove)
  {
    name: 'modifyPolicyBlacklist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'uint64' },
      { name: 'account', type: 'address' },
      { name: 'restricted', type: 'bool' },
    ],
    outputs: [],
  },
  // Error definitions
  {
    name: 'Unauthorized',
    type: 'error',
    inputs: [],
  },
  {
    name: 'IncompatiblePolicyType',
    type: 'error',
    inputs: [],
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
  // PolicyCreated event - emitted when a new policy is created
  {
    name: 'PolicyCreated',
    type: 'event',
    inputs: [
      { name: 'policyId', type: 'uint64', indexed: true },
      { name: 'updater', type: 'address', indexed: true },
      { name: 'policyType', type: 'uint8', indexed: false },
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
  // Authorization Query Methods
  // ===========================================================================

  /**
   * Check if an address is authorized under a policy.
   *
   * Uses TIP-403's isAuthorized function which checks:
   * - For whitelist policies: returns true if address is ON the whitelist
   * - For blacklist policies: returns true if address is NOT on the blacklist
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to check
   * @returns True if address is authorized
   * @throws Error if policy doesn't exist
   */
  async isAuthorized(policyId: number, account: Address): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'isAuthorized',
        args: [BigInt(policyId), account],
      });

      return result as boolean;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
        throw new Error(`Policy ID ${policyId} does not exist.`);
      }
      throw error;
    }
  }

  /**
   * Check if an address is on the whitelist for a policy.
   *
   * For whitelist policies: returns isAuthorized result
   * For blacklist/none policies: always returns false (not a whitelist)
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to check
   * @returns True if address is whitelisted
   */
  async isWhitelisted(policyId: number, account: Address): Promise<boolean> {
    try {
      // Get policy type first
      const policy = await this.getPolicy(policyId);

      // Only whitelist policies have whitelists
      if (policy.policyType !== 'whitelist') {
        return false;
      }

      // For whitelist policies, isAuthorized = isWhitelisted
      return await this.isAuthorized(policyId, account);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not exist')) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Check if an address is on the blacklist for a policy.
   *
   * For blacklist policies: returns !isAuthorized (blocked = not authorized)
   * For whitelist/none policies: always returns false (not a blacklist)
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @param account - Address to check
   * @returns True if address is blacklisted
   */
  async isBlacklisted(policyId: number, account: Address): Promise<boolean> {
    try {
      // Get policy type first
      const policy = await this.getPolicy(policyId);

      // Only blacklist policies have blacklists
      if (policy.policyType !== 'blacklist') {
        return false;
      }

      // For blacklist policies, !isAuthorized = isBlacklisted
      const authorized = await this.isAuthorized(policyId, account);
      return !authorized;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not exist')) {
        throw error;
      }
      throw error;
    }
  }

  // ===========================================================================
  // Policy Query Methods
  // ===========================================================================

  /**
   * Get policy information by ID.
   *
   * Built-in policies:
   * - policyId = 0: Always rejects transfers
   * - policyId = 1: Always allows transfers (default for new tokens)
   * - Custom policies start at policyId = 2
   *
   * @param policyId - Policy ID in the TIP-403 registry
   * @returns Policy details including type and admin
   * @throws Error if policy doesn't exist
   */
  async getPolicy(policyId: number): Promise<PolicyInfo> {
    try {
      // First check if policy exists
      const exists = await this.publicClient.readContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'policyExists',
        args: [BigInt(policyId)],
      });

      if (!exists) {
        // Built-in policies (0 and 1) always exist but may not show via policyExists
        if (policyId === 0) {
          return {
            policyId: 0,
            policyType: 'none',
            owner: '0x0000000000000000000000000000000000000000' as Address,
            tokenCount: 0,
          };
        }
        if (policyId === 1) {
          return {
            policyId: 1,
            policyType: 'none',
            owner: '0x0000000000000000000000000000000000000000' as Address,
            tokenCount: 0,
          };
        }
        throw new Error(
          `Policy ID ${policyId} does not exist. Custom policies start at ID 2. Use policyId=0 (always reject) or policyId=1 (always allow) for built-in policies.`
        );
      }

      // Get policy data
      const result = await this.publicClient.readContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'policyData',
        args: [BigInt(policyId)],
      });

      const [policyTypeNum, admin] = result as [number, Address];

      return {
        policyId,
        policyType: POLICY_TYPE_VALUES[policyTypeNum] || 'none',
        owner: admin,
        tokenCount: 0, // tokenCount not available in policyData
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check for Tempo's Unauthorized error (0xaa4bc69a)
      if (errorMessage.includes('0xaa4bc69a') || errorMessage.includes('Unauthorized')) {
        throw new Error(
          `Policy ID ${policyId} does not exist. Custom policies start at ID 2. Built-in: 0 (always reject), 1 (always allow).`
        );
      }
      // Check for arithmetic overflow - known contract bug with whitelist policies
      if (
        errorMessage.includes('underflow or overflow') ||
        errorMessage.includes('0x4e487b71') ||
        errorMessage.includes('panic')
      ) {
        throw new Error(
          `Unable to read policy ${policyId}. This may be a whitelist policy affected by a known contract issue. ` +
            `The policy exists and can be used with add_to_whitelist/is_whitelisted tools, but policyData() fails. ` +
            `Try using is_whitelisted to verify the policy type.`
        );
      }
      throw error;
    }
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
  // Policy Creation Methods
  // ===========================================================================

  /**
   * Create a new TIP-403 policy.
   *
   * Creates an empty policy that can be configured with whitelist/blacklist entries.
   * The caller becomes the policy admin.
   *
   * @param policyType - Type of policy: 'whitelist' or 'blacklist'
   * @param admin - Admin address for the policy (defaults to caller)
   * @returns Transaction result with the new policy ID
   * @throws Error if wallet not configured or transaction fails
   */
  async createPolicy(
    policyType: 'whitelist' | 'blacklist',
    admin?: Address
  ): Promise<PolicyOperationResult & { policyId: number }> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Convert policy type to numeric value per TIP-403: enum { WHITELIST=0, BLACKLIST=1 }
    const policyTypeNum = policyType === 'whitelist' ? 0 : 1;

    // Default admin to caller if not specified
    const adminAddress = admin || this.client.getAddress();

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'createPolicy',
        args: [adminAddress, policyTypeNum],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Extract policyId from the PolicyCreated event in transaction logs
      // This is more reliable than reading policyIdCounter which can race
      let createdPolicyId: number | undefined;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: POLICY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === 'PolicyCreated') {
            createdPolicyId = Number((decoded.args as { policyId: bigint }).policyId);
            break;
          }
        } catch {
          // Not a PolicyCreated event, continue
        }
      }

      // Fallback to policyIdCounter if event parsing fails (shouldn't happen)
      if (createdPolicyId === undefined) {
        const nextId = await this.publicClient.readContract({
          address: POLICY_REGISTRY_ADDRESS,
          abi: POLICY_REGISTRY_ABI,
          functionName: 'policyIdCounter',
          args: [],
        });
        createdPolicyId = Number(nextId) - 1;
      }

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        policyId: createdPolicyId,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized')
      ) {
        throw BlockchainError.transactionReverted(
          'Unauthorized: Failed to create policy.'
        );
      }
      throw error;
    }
  }

  /**
   * Create a new TIP-403 policy with initial accounts.
   *
   * Creates a policy pre-populated with whitelist or blacklist entries.
   * The caller becomes the policy admin.
   *
   * @param policyType - Type of policy: 'whitelist' or 'blacklist'
   * @param accounts - Initial addresses to add to the policy
   * @param admin - Admin address for the policy (defaults to caller)
   * @returns Transaction result with the new policy ID
   * @throws Error if wallet not configured or transaction fails
   */
  async createPolicyWithAccounts(
    policyType: 'whitelist' | 'blacklist',
    accounts: Address[],
    admin?: Address
  ): Promise<PolicyOperationResult & { policyId: number }> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Convert policy type to numeric value per TIP-403: enum { WHITELIST=0, BLACKLIST=1 }
    const policyTypeNum = policyType === 'whitelist' ? 0 : 1;

    // Default admin to caller if not specified
    const adminAddress = admin || this.client.getAddress();

    try {
      const hash = await walletClient.writeContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'createPolicyWithAccounts',
        args: [adminAddress, policyTypeNum, accounts],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Extract policyId from the PolicyCreated event in transaction logs
      let createdPolicyId: number | undefined;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: POLICY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === 'PolicyCreated') {
            createdPolicyId = Number((decoded.args as { policyId: bigint }).policyId);
            break;
          }
        } catch {
          // Not a PolicyCreated event, continue
        }
      }

      // Fallback to policyIdCounter if event parsing fails
      if (createdPolicyId === undefined) {
        const nextId = await this.publicClient.readContract({
          address: POLICY_REGISTRY_ADDRESS,
          abi: POLICY_REGISTRY_ABI,
          functionName: 'policyIdCounter',
          args: [],
        });
        createdPolicyId = Number(nextId) - 1;
      }

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        policyId: createdPolicyId,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized')
      ) {
        throw BlockchainError.transactionReverted(
          'Unauthorized: Failed to create policy.'
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Whitelist Management Methods
  // ===========================================================================

  /**
   * Add an address to a policy's whitelist.
   *
   * Requires the caller to be the policy admin.
   * Uses modifyPolicyWhitelist(policyId, account, allowed=true).
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
        functionName: 'modifyPolicyWhitelist',
        args: [BigInt(policyId), account, true], // allowed = true
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
      // Check for IncompatiblePolicyType error
      if (errorMessage.includes('IncompatiblePolicyType')) {
        throw BlockchainError.transactionReverted(
          `Policy ${policyId} is not a whitelist policy. Use add_to_blacklist for blacklist policies.`
        );
      }
      // Check for Tempo's Unauthorized error (0x82b42900)
      if (
        errorMessage.includes('0xaa4bc69a') ||
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: Policy ID ${policyId} may not exist, or caller is not the policy owner.`
        );
      }
      throw error;
    }
  }

  /**
   * Remove an address from a policy's whitelist.
   *
   * Requires the caller to be the policy admin.
   * Uses modifyPolicyWhitelist(policyId, account, allowed=false).
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
        functionName: 'modifyPolicyWhitelist',
        args: [BigInt(policyId), account, false], // allowed = false
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
      // Check for IncompatiblePolicyType error
      if (errorMessage.includes('IncompatiblePolicyType')) {
        throw BlockchainError.transactionReverted(
          `Policy ${policyId} is not a whitelist policy. Use remove_from_blacklist for blacklist policies.`
        );
      }
      // Check for Tempo's Unauthorized error (0x82b42900)
      if (
        errorMessage.includes('0xaa4bc69a') ||
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: Policy ID ${policyId} may not exist, or caller is not the policy owner.`
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
   * Requires the caller to be the policy admin.
   * Uses modifyPolicyBlacklist(policyId, account, restricted=true).
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
        functionName: 'modifyPolicyBlacklist',
        args: [BigInt(policyId), account, true], // restricted = true
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
      // Check for IncompatiblePolicyType error
      if (errorMessage.includes('IncompatiblePolicyType')) {
        throw BlockchainError.transactionReverted(
          `Policy ${policyId} is not a blacklist policy. Use add_to_whitelist for whitelist policies.`
        );
      }
      // Check for Tempo's Unauthorized error (0x82b42900)
      if (
        errorMessage.includes('0xaa4bc69a') ||
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: Policy ID ${policyId} may not exist, or caller is not the policy owner.`
        );
      }
      throw error;
    }
  }

  /**
   * Remove an address from a policy's blacklist (unblock the address).
   *
   * Requires the caller to be the policy admin.
   * Uses modifyPolicyBlacklist(policyId, account, restricted=false).
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
        functionName: 'modifyPolicyBlacklist',
        args: [BigInt(policyId), account, false], // restricted = false
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
      // Check for IncompatiblePolicyType error
      if (errorMessage.includes('IncompatiblePolicyType')) {
        throw BlockchainError.transactionReverted(
          `Policy ${policyId} is not a blacklist policy. Use remove_from_whitelist for whitelist policies.`
        );
      }
      // Check for Tempo's Unauthorized error (0x82b42900)
      if (
        errorMessage.includes('0xaa4bc69a') ||
        errorMessage.includes('0x82b42900') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('not owner') ||
        errorMessage.includes('not admin')
      ) {
        throw BlockchainError.transactionReverted(
          `Unauthorized: Policy ID ${policyId} may not exist, or caller is not the policy owner.`
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

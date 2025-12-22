/**
 * Rewards Service
 *
 * Service layer for TIP-20 token rewards management.
 * Provides methods for opting into/out of rewards, claiming rewards,
 * checking pending balances, and managing reward forwarding.
 *
 * TIP-20 Rewards Model:
 * - Holders must explicitly opt in to receive rewards
 * - Rewards are distributed pro-rata based on opted-in balances
 * - Rewards can be claimed or auto-forwarded to a designated recipient
 */

import { type Address, type Hash } from 'viem';
import { getTempoClient, TIP20_ABI, type TempoPublicClient } from './tempo-client.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// TIP-20 Rewards ABI
// =============================================================================

/**
 * TIP-20 Rewards ABI for reward-related operations.
 * These functions are part of the TIP-20 token standard for reward distribution.
 */
export const TIP20_REWARDS_ABI = [
  // ===========================================================================
  // Opt-in/Opt-out Functions
  // ===========================================================================
  {
    name: 'optInRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'optOutRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // ===========================================================================
  // Claiming Functions
  // ===========================================================================
  {
    name: 'claimRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  // ===========================================================================
  // Recipient Management
  // ===========================================================================
  {
    name: 'setRewardRecipient',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [],
  },
  // ===========================================================================
  // View Functions
  // ===========================================================================
  {
    name: 'pendingRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    name: 'rewardRecipient',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'recipient', type: 'address' }],
  },
  {
    name: 'isOptedInRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'optedIn', type: 'bool' }],
  },
  {
    name: 'totalOptedInSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'supply', type: 'uint256' }],
  },
  {
    name: 'optedInBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'totalRewardsDistributed',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    name: 'totalRewardsClaimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  // ===========================================================================
  // Events
  // ===========================================================================
  {
    name: 'RewardsOptIn',
    type: 'event',
    inputs: [{ name: 'account', type: 'address', indexed: true }],
  },
  {
    name: 'RewardsOptOut',
    type: 'event',
    inputs: [{ name: 'account', type: 'address', indexed: true }],
  },
  {
    name: 'RewardsClaimed',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
  {
    name: 'RewardRecipientSet',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

/** Result of a rewards operation with transaction details */
export interface RewardsOperationResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

/** Result of claiming rewards */
export interface ClaimRewardsResult extends RewardsOperationResult {
  amountClaimed: bigint;
}

/** Complete reward status for an account */
export interface RewardStatus {
  isOptedIn: boolean;
  pendingRewards: bigint;
  optedInBalance: bigint;
  totalBalance: bigint;
  rewardRecipient: Address | null;
  totalClaimed: bigint;
  tokenStats: {
    totalOptedInSupply: bigint;
    totalDistributed: bigint;
  };
}

/** Zero address constant */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// =============================================================================
// RewardsService Class
// =============================================================================

/**
 * Service for managing TIP-20 token rewards.
 *
 * Provides methods for:
 * - Opting in/out of rewards (optInRewards, optOutRewards)
 * - Claiming rewards (claimRewards)
 * - Querying reward status (getPendingRewards, getRewardStatus)
 * - Managing reward recipients (setRewardRecipient)
 *
 * @example
 * ```typescript
 * const rewardsService = getRewardsService();
 *
 * // Opt into rewards
 * const result = await rewardsService.optInRewards(tokenAddress);
 *
 * // Check pending rewards
 * const pending = await rewardsService.getPendingRewards(tokenAddress);
 *
 * // Claim rewards
 * const claimResult = await rewardsService.claimRewards(tokenAddress);
 * console.log('Claimed:', claimResult.amountClaimed);
 * ```
 */
export class RewardsService {
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
  // Opt-in/Opt-out Methods
  // ===========================================================================

  /**
   * Opt into rewards for a TIP-20 token.
   *
   * After opting in, the holder's balance will be counted for reward
   * distribution and they will start accumulating rewards.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async optInRewards(tokenAddress: Address): Promise<RewardsOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'optInRewards',
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
      if (errorMessage.includes('AlreadyOptedIn')) {
        throw BlockchainError.transactionReverted(
          `Already opted into rewards for this token. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Opt out of rewards for a TIP-20 token.
   *
   * After opting out, the holder's balance will no longer be counted
   * for reward distribution and they will stop accumulating rewards.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param claimPending - If true, claims pending rewards before opting out
   * @returns Transaction result (or claim result if claimPending is true)
   * @throws Error if wallet not configured or transaction fails
   */
  async optOutRewards(
    tokenAddress: Address,
    claimPending = true
  ): Promise<RewardsOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // If claimPending is true, check and claim pending rewards first
    if (claimPending) {
      const pending = await this.getPendingRewards(tokenAddress);
      if (pending > 0n) {
        await this.claimRewards(tokenAddress);
      }
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'optOutRewards',
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
      if (errorMessage.includes('NotOptedIn')) {
        throw BlockchainError.transactionReverted(
          `Not currently opted into rewards for this token. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Claim Methods
  // ===========================================================================

  /**
   * Claim pending rewards for a TIP-20 token.
   *
   * Claims all accumulated rewards and sends them to either the caller's
   * address or their configured reward recipient (if set).
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Transaction result with claimed amount
   * @throws Error if wallet not configured or transaction fails
   */
  async claimRewards(tokenAddress: Address): Promise<ClaimRewardsResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Get pending rewards before claiming to know how much was claimed
    const pendingBefore = await this.getPendingRewards(tokenAddress);

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'claimRewards',
        args: [],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Parse claimed amount from events or use pending before
      const amountClaimed = this.parseClaimAmount(receipt) || pendingBefore;

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        amountClaimed,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('NoPendingRewards') || errorMessage.includes('NoRewardsToClaim')) {
        throw BlockchainError.transactionReverted(
          `No pending rewards to claim. ${errorMessage}`
        );
      }
      if (errorMessage.includes('NotOptedIn')) {
        throw BlockchainError.transactionReverted(
          `Must be opted in to claim rewards. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Parse claimed amount from transaction receipt logs.
   *
   * @param receipt - Transaction receipt
   * @returns Claimed amount or 0n if not found
   */
  private parseClaimAmount(receipt: { logs: readonly { topics: readonly string[]; data: string }[] }): bigint {
    // Look for RewardsClaimed event
    // Event signature: RewardsClaimed(address indexed account, uint256 amount, address indexed recipient)
    for (const log of receipt.logs) {
      // The event has 3 indexed parameters + data
      // topics[0] is the event signature
      // topics[1] is the indexed account
      // topics[2] is the indexed recipient
      // data contains the amount
      if (log.topics.length >= 3 && log.data && log.data.length >= 66) {
        try {
          // Data contains the uint256 amount
          return BigInt(log.data.slice(0, 66));
        } catch {
          // Continue to next log if parsing fails
        }
      }
    }
    return 0n;
  }

  // ===========================================================================
  // Recipient Management Methods
  // ===========================================================================

  /**
   * Set the auto-forward recipient for rewards.
   *
   * When set, claimed rewards will be automatically sent to the
   * specified recipient address instead of the caller.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param recipient - Address to forward rewards to
   * @returns Transaction result
   * @throws Error if wallet not configured or transaction fails
   */
  async setRewardRecipient(
    tokenAddress: Address,
    recipient: Address
  ): Promise<RewardsOperationResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'setRewardRecipient',
        args: [recipient],
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
      if (errorMessage.includes('InvalidRecipient')) {
        throw BlockchainError.transactionReverted(
          `Invalid reward recipient address. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get pending rewards for an address.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Pending reward amount in token units
   */
  async getPendingRewards(
    tokenAddress: Address,
    address?: Address
  ): Promise<bigint> {
    const targetAddress = address ?? this.client.getAddress();

    const pending = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'pendingRewards',
      args: [targetAddress],
    });

    return pending as bigint;
  }

  /**
   * Check if an address is opted into rewards.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns True if opted in
   */
  async isOptedIn(tokenAddress: Address, address?: Address): Promise<boolean> {
    const targetAddress = address ?? this.client.getAddress();

    const optedIn = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'isOptedInRewards',
      args: [targetAddress],
    });

    return optedIn as boolean;
  }

  /**
   * Get the reward recipient for an address.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Recipient address or null if not set
   */
  async getRewardRecipient(
    tokenAddress: Address,
    address?: Address
  ): Promise<Address | null> {
    const targetAddress = address ?? this.client.getAddress();

    const recipient = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'rewardRecipient',
      args: [targetAddress],
    });

    const recipientAddress = recipient as Address;
    return recipientAddress !== ZERO_ADDRESS ? recipientAddress : null;
  }

  /**
   * Get the opted-in balance for an address.
   *
   * This is the balance counted for reward distribution.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Opted-in balance
   */
  async getOptedInBalance(
    tokenAddress: Address,
    address?: Address
  ): Promise<bigint> {
    const targetAddress = address ?? this.client.getAddress();

    const balance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'optedInBalance',
      args: [targetAddress],
    });

    return balance as bigint;
  }

  /**
   * Get total rewards claimed by an address.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Total claimed amount
   */
  async getTotalClaimed(
    tokenAddress: Address,
    address?: Address
  ): Promise<bigint> {
    const targetAddress = address ?? this.client.getAddress();

    const claimed = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'totalRewardsClaimed',
      args: [targetAddress],
    });

    return claimed as bigint;
  }

  /**
   * Get total opted-in supply for a token.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Total opted-in supply
   */
  async getTotalOptedInSupply(tokenAddress: Address): Promise<bigint> {
    const supply = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'totalOptedInSupply',
      args: [],
    });

    return supply as bigint;
  }

  /**
   * Get total rewards distributed for a token.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Total distributed amount
   */
  async getTotalDistributed(tokenAddress: Address): Promise<bigint> {
    const distributed = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'totalRewardsDistributed',
      args: [],
    });

    return distributed as bigint;
  }

  /**
   * Get complete reward status for an address.
   *
   * Fetches all reward-related information in parallel for efficiency.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Complete reward status
   */
  async getRewardStatus(
    tokenAddress: Address,
    address?: Address
  ): Promise<RewardStatus> {
    const targetAddress = address ?? this.client.getAddress();

    // Fetch all data in parallel for efficiency
    const [
      isOptedIn,
      pendingRewards,
      optedInBalance,
      totalBalance,
      rewardRecipient,
      totalClaimed,
      totalOptedInSupply,
      totalDistributed,
    ] = await Promise.all([
      this.isOptedIn(tokenAddress, targetAddress),
      this.getPendingRewards(tokenAddress, targetAddress),
      this.getOptedInBalance(tokenAddress, targetAddress),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'balanceOf',
        args: [targetAddress],
      }),
      this.getRewardRecipient(tokenAddress, targetAddress),
      this.getTotalClaimed(tokenAddress, targetAddress),
      this.getTotalOptedInSupply(tokenAddress),
      this.getTotalDistributed(tokenAddress),
    ]);

    return {
      isOptedIn,
      pendingRewards,
      optedInBalance,
      totalBalance: totalBalance as bigint,
      rewardRecipient,
      totalClaimed,
      tokenStats: {
        totalOptedInSupply,
        totalDistributed,
      },
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: RewardsService | null = null;

/**
 * Get or create the singleton RewardsService instance.
 *
 * @returns The shared RewardsService instance
 */
export function getRewardsService(): RewardsService {
  if (!serviceInstance) {
    serviceInstance = new RewardsService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetRewardsService(): void {
  serviceInstance = null;
}

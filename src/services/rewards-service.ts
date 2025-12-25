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
    // userRewardInfo returns (rewardRecipient, rewardPerToken, rewardBalance)
    // - rewardRecipient != 0x0 means user is opted in
    // - rewardBalance is the claimable pending rewards
    name: 'userRewardInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'rewardRecipient', type: 'address' },
      { name: 'rewardPerToken', type: 'uint256' },
      { name: 'rewardBalance', type: 'uint256' },
    ],
  },
  {
    // optedInSupply returns the total supply of tokens opted into rewards
    name: 'optedInSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'supply', type: 'uint128' }],
  },
  // ===========================================================================
  // Distribution Functions
  // ===========================================================================
  {
    name: 'startReward',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'secs', type: 'uint32' },
    ],
    outputs: [{ name: 'rewardId', type: 'uint64' }],
  },
  // ===========================================================================
  // Events
  // ===========================================================================
  {
    name: 'RewardScheduled',
    type: 'event',
    inputs: [
      { name: 'funder', type: 'address', indexed: true },
      { name: 'id', type: 'uint64', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'durationSeconds', type: 'uint32', indexed: false },
    ],
  },
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

/** Result of distributing rewards */
export interface DistributeRewardsResult extends RewardsOperationResult {
  rewardId: bigint;
  amount: bigint;
  durationSeconds: number;
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
   * This calls setRewardRecipient with the caller's own address.
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

    // Opt in by setting reward recipient to self
    const callerAddress = this.client.getAddress();

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'setRewardRecipient',
        args: [callerAddress],
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
      // Opt out by setting reward recipient to zero address
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'setRewardRecipient',
        args: [ZERO_ADDRESS],
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
      if (errorMessage.includes('NotOptedIn') || errorMessage.includes('0xaa4bc69a')) {
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
  // Distribution Methods
  // ===========================================================================

  /**
   * Distribute rewards to all opted-in token holders.
   *
   * This starts a reward distribution that allocates tokens proportionally
   * to all opted-in holders based on their balance. The distribution occurs
   * over the specified duration in seconds.
   *
   * Requirements:
   * - Caller must have sufficient token balance to fund the rewards
   * - Token must have rewards enabled
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param amount - Amount of tokens to distribute as rewards
   * @param durationSeconds - Duration over which to distribute rewards (in seconds)
   * @returns Transaction result with reward ID
   * @throws Error if wallet not configured or transaction fails
   */
  async distributeRewards(
    tokenAddress: Address,
    amount: bigint,
    durationSeconds: number
  ): Promise<DistributeRewardsResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TIP20_REWARDS_ABI,
        functionName: 'startReward',
        args: [amount, durationSeconds],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Parse reward ID from RewardScheduled event
      const rewardId = this.parseRewardId(receipt);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        rewardId,
        amount,
        durationSeconds,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('RewardsDisabled') || errorMessage.includes('0xaa4bc69a')) {
        throw BlockchainError.transactionReverted(
          `Rewards are not enabled for this token. ${errorMessage}`
        );
      }
      if (errorMessage.includes('InsufficientBalance')) {
        throw BlockchainError.transactionReverted(
          `Insufficient token balance to fund rewards. ${errorMessage}`
        );
      }
      throw error;
    }
  }

  /**
   * Parse reward ID from transaction receipt logs.
   *
   * @param receipt - Transaction receipt
   * @returns Reward ID or 0n if not found
   */
  private parseRewardId(receipt: { logs: readonly { topics: readonly string[]; data: string }[] }): bigint {
    // Look for RewardScheduled event
    // Event signature: RewardScheduled(address indexed funder, uint64 indexed id, uint256 amount, uint32 durationSeconds)
    for (const log of receipt.logs) {
      // topics[0] is the event signature
      // topics[1] is the indexed funder
      // topics[2] is the indexed id (reward ID)
      if (log.topics.length >= 3) {
        try {
          // The id is in topics[2]
          return BigInt(log.topics[2]);
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
   * Uses userRewardInfo().rewardBalance to get pending claimable rewards.
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

    // Use userRewardInfo to get pending rewards (rewardBalance field)
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'userRewardInfo',
      args: [targetAddress],
    }) as [Address, bigint, bigint];

    // rewardBalance is the third field (index 2)
    return result[2];
  }

  /**
   * Check if an address is opted into rewards.
   *
   * Uses userRewardInfo to check if rewardRecipient is set (non-zero).
   * A user is considered opted-in if they have set a reward recipient.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns True if opted in
   */
  async isOptedIn(tokenAddress: Address, address?: Address): Promise<boolean> {
    const targetAddress = address ?? this.client.getAddress();

    // Use userRewardInfo to check opted-in status
    // A user is opted in if their rewardRecipient is non-zero
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'userRewardInfo',
      args: [targetAddress],
    }) as [Address, bigint, bigint];

    const rewardRecipient = result[0];
    return rewardRecipient !== ZERO_ADDRESS;
  }

  /**
   * Get the reward recipient for an address.
   *
   * Uses userRewardInfo to get the reward recipient.
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

    // Use userRewardInfo to get the reward recipient
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_REWARDS_ABI,
      functionName: 'userRewardInfo',
      args: [targetAddress],
    }) as [Address, bigint, bigint];

    const recipientAddress = result[0];
    return recipientAddress !== ZERO_ADDRESS ? recipientAddress : null;
  }

  /**
   * Get the opted-in balance for an address.
   *
   * When a user is opted in, their entire token balance is counted for
   * reward distribution. Returns 0 if user is not opted in.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Opted-in balance (equal to token balance if opted in, 0 otherwise)
   */
  async getOptedInBalance(
    tokenAddress: Address,
    address?: Address
  ): Promise<bigint> {
    const targetAddress = address ?? this.client.getAddress();

    // Check if user is opted in using userRewardInfo
    const isOptedIn = await this.isOptedIn(tokenAddress, targetAddress);

    if (!isOptedIn) {
      return 0n;
    }

    // If opted in, opted-in balance equals total balance
    const balance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'balanceOf',
      args: [targetAddress],
    });

    return balance as bigint;
  }

  /**
   * Get total rewards claimed by an address.
   *
   * Note: This information is not directly available from the contract.
   * Returns 0 as a placeholder.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @param address - Address to check (defaults to wallet address)
   * @returns Total claimed amount (always 0 - not tracked on-chain)
   */
  async getTotalClaimed(
    _tokenAddress: Address,
    _address?: Address
  ): Promise<bigint> {
    // Total claimed is not tracked in the contract interface
    // This would require indexing Transfer events from the token contract
    return 0n;
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
      functionName: 'optedInSupply',
      args: [],
    });

    return supply as bigint;
  }

  /**
   * Get total rewards distributed for a token.
   *
   * Note: This information is not directly available from the contract.
   * Returns 0 as a placeholder.
   *
   * @param tokenAddress - TIP-20 token contract address
   * @returns Total distributed amount (always 0 - not tracked on-chain)
   */
  async getTotalDistributed(_tokenAddress: Address): Promise<bigint> {
    // Total distributed is not tracked in the contract interface
    // This would require indexing RewardScheduled events
    return 0n;
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

/**
 * Fee AMM Service
 *
 * Service layer for managing liquidity in Tempo's Fee AMM.
 * The Fee AMM enables automatic gas fee token conversion, allowing
 * users to pay gas in any USD stablecoin while validators receive
 * their preferred token.
 *
 * Key Features:
 * - Fixed swap rate of 0.9985 (0.15% protocol fee)
 * - LP tokens represent pro-rata ownership of pool reserves
 * - First liquidity provider burns 1000 units to prevent manipulation
 */

import { type Address, type Hash } from 'viem';
import { getTempoClient, type TempoPublicClient } from './tempo-client.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** Fee AMM contract address on Tempo */
export const FEE_AMM_ADDRESS = '0xfeec000000000000000000000000000000000000' as Address;

/** PathUSD - Default validator token */
export const PATH_USD_ADDRESS = '0x20c0000000000000000000000000000000000000' as Address;

/** Minimum LP tokens burned on first deposit to prevent manipulation */
export const MINIMUM_LIQUIDITY = 1000n;

/** Fixed swap rate (0.15% fee) */
export const FEE_SWAP_RATE = 0.9985;

// =============================================================================
// ERC-20 Approval ABI (for token approvals)
// =============================================================================

/**
 * ERC-20 approval ABI for allowance checks and approvals.
 */
const ERC20_APPROVAL_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// =============================================================================
// Fee AMM ABI
// =============================================================================

/**
 * Fee AMM ABI for pool and liquidity operations.
 */
export const FEE_AMM_ABI = [
  // ===========================================================================
  // View Functions
  // ===========================================================================
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
    ],
    outputs: [
      { name: 'reserveUser', type: 'uint256' },
      { name: 'reserveValidator', type: 'uint256' },
      { name: 'totalLpSupply', type: 'uint256' },
    ],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'quote',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'fromToken', type: 'address' },
      { name: 'toToken', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  // ===========================================================================
  // State-Changing Functions
  // ===========================================================================
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
      { name: 'amountUser', type: 'uint256' },
      { name: 'amountValidator', type: 'uint256' },
    ],
    outputs: [{ name: 'lpTokens', type: 'uint256' }],
  },
  {
    name: 'burn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
      { name: 'lpAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountUser', type: 'uint256' },
      { name: 'amountValidator', type: 'uint256' },
    ],
  },
  // ===========================================================================
  // Events
  // ===========================================================================
  {
    name: 'Mint',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'userToken', type: 'address', indexed: true },
      { name: 'validatorToken', type: 'address', indexed: true },
      { name: 'amountUser', type: 'uint256', indexed: false },
      { name: 'amountValidator', type: 'uint256', indexed: false },
      { name: 'lpTokens', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Burn',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'userToken', type: 'address', indexed: true },
      { name: 'validatorToken', type: 'address', indexed: true },
      { name: 'lpAmount', type: 'uint256', indexed: false },
      { name: 'amountUser', type: 'uint256', indexed: false },
      { name: 'amountValidator', type: 'uint256', indexed: false },
    ],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

/** Information about a fee pool */
export interface PoolInfo {
  userToken: Address;
  validatorToken: Address;
  reserveUser: bigint;
  reserveValidator: bigint;
  totalLpSupply: bigint;
  swapRate: number;
}

/** LP position for an account */
export interface LpPosition {
  lpBalance: bigint;
  shareOfPool: number;
  underlyingUserToken: bigint;
  underlyingValidatorToken: bigint;
}

/** Result of adding liquidity */
export interface AddLiquidityResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
  lpTokensMinted: bigint;
  userTokenAdded: bigint;
  validatorTokenAdded: bigint;
}

/** Result of removing liquidity */
export interface RemoveLiquidityResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
  lpTokensBurned: bigint;
  userTokenReceived: bigint;
  validatorTokenReceived: bigint;
}

// =============================================================================
// FeeAmmService Class
// =============================================================================

/**
 * Service for managing Fee AMM liquidity.
 *
 * The Fee AMM enables automatic conversion between stablecoins for gas fee
 * payment. Users can pay gas in any USD stablecoin, and the Fee AMM converts
 * it to the validator's preferred token at a fixed rate.
 *
 * @example
 * ```typescript
 * const feeAmmService = getFeeAmmService();
 *
 * // Get pool info
 * const poolInfo = await feeAmmService.getPoolInfo(alphaUsdAddress);
 *
 * // Add liquidity
 * const result = await feeAmmService.addLiquidity({
 *   userToken: alphaUsdAddress,
 *   amountUser: parseUnits('1000', 6),
 *   amountValidator: parseUnits('1000', 6),
 * });
 *
 * // Check LP position
 * const position = await feeAmmService.getLpPosition(alphaUsdAddress);
 * ```
 */
export class FeeAmmService {
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
  // Pool Query Methods
  // ===========================================================================

  /**
   * Get fee pool information.
   *
   * @param userToken - User fee token address
   * @param validatorToken - Validator token address (defaults to PathUSD)
   * @returns Pool information including reserves and LP supply
   */
  async getPoolInfo(
    userToken: Address,
    validatorToken?: Address
  ): Promise<PoolInfo> {
    const valToken = validatorToken ?? PATH_USD_ADDRESS;

    const result = await this.publicClient.readContract({
      address: FEE_AMM_ADDRESS,
      abi: FEE_AMM_ABI,
      functionName: 'getPool',
      args: [userToken, valToken],
    });

    const [reserveUser, reserveValidator, totalLpSupply] = result as [bigint, bigint, bigint];

    return {
      userToken,
      validatorToken: valToken,
      reserveUser,
      reserveValidator,
      totalLpSupply,
      swapRate: FEE_SWAP_RATE,
    };
  }

  /**
   * Get LP position for an account.
   *
   * @param userToken - User fee token address
   * @param validatorToken - Validator token address (defaults to PathUSD)
   * @param account - Account to check (defaults to wallet address)
   * @returns LP position with balance and underlying token amounts
   */
  async getLpPosition(
    userToken: Address,
    validatorToken?: Address,
    account?: Address
  ): Promise<LpPosition> {
    const valToken = validatorToken ?? PATH_USD_ADDRESS;
    const targetAccount = account ?? this.client.getAddress();

    // Fetch LP balance and pool info in parallel
    const [lpBalance, poolInfo] = await Promise.all([
      this.publicClient.readContract({
        address: FEE_AMM_ADDRESS,
        abi: FEE_AMM_ABI,
        functionName: 'balanceOf',
        args: [userToken, valToken, targetAccount],
      }) as Promise<bigint>,
      this.getPoolInfo(userToken, valToken),
    ]);

    // Calculate share of pool
    const shareOfPool = poolInfo.totalLpSupply > 0n
      ? Number(lpBalance) / Number(poolInfo.totalLpSupply)
      : 0;

    // Calculate underlying token amounts
    const underlyingUserToken = poolInfo.totalLpSupply > 0n
      ? (lpBalance * poolInfo.reserveUser) / poolInfo.totalLpSupply
      : 0n;

    const underlyingValidatorToken = poolInfo.totalLpSupply > 0n
      ? (lpBalance * poolInfo.reserveValidator) / poolInfo.totalLpSupply
      : 0n;

    return {
      lpBalance,
      shareOfPool,
      underlyingUserToken,
      underlyingValidatorToken,
    };
  }

  /**
   * Estimate fee swap output.
   *
   * @param fromToken - Token to swap from
   * @param toToken - Token to swap to
   * @param amountIn - Amount to swap
   * @returns Expected output amount
   */
  async estimateFeeSwap(
    fromToken: Address,
    toToken: Address,
    amountIn: bigint
  ): Promise<bigint> {
    const amountOut = await this.publicClient.readContract({
      address: FEE_AMM_ADDRESS,
      abi: FEE_AMM_ABI,
      functionName: 'quote',
      args: [fromToken, toToken, amountIn],
    });

    return amountOut as bigint;
  }

  // ===========================================================================
  // Liquidity Management Methods
  // ===========================================================================

  /**
   * Add liquidity to a fee pool.
   *
   * Both tokens must be approved to the Fee AMM contract before calling.
   * The first liquidity provider will have 1000 LP tokens burned to prevent
   * manipulation attacks.
   *
   * @param params - Liquidity parameters
   * @returns Transaction result with LP tokens minted
   * @throws Error if wallet not configured or transaction fails
   */
  async addLiquidity(params: {
    userToken: Address;
    validatorToken?: Address;
    amountUser: bigint;
    amountValidator: bigint;
  }): Promise<AddLiquidityResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const { userToken, amountUser, amountValidator } = params;
    const validatorToken = params.validatorToken ?? PATH_USD_ADDRESS;

    try {
      // Approve both tokens to Fee AMM
      await this.approveToken(userToken, amountUser);
      await this.approveToken(validatorToken, amountValidator);

      // Add liquidity
      const hash = await walletClient.writeContract({
        address: FEE_AMM_ADDRESS,
        abi: FEE_AMM_ABI,
        functionName: 'mint',
        args: [userToken, validatorToken, amountUser, amountValidator],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Parse LP tokens minted from event
      const lpTokensMinted = this.parseMintEvent(receipt);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        lpTokensMinted,
        userTokenAdded: amountUser,
        validatorTokenAdded: amountValidator,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('InsufficientBalance')) {
        throw BlockchainError.transactionReverted(
          'Insufficient token balance to add liquidity'
        );
      }
      if (errorMessage.includes('InsufficientAllowance')) {
        throw BlockchainError.transactionReverted(
          'Token approval required before adding liquidity'
        );
      }
      throw error;
    }
  }

  /**
   * Remove liquidity from a fee pool.
   *
   * Burns LP tokens and returns the underlying user and validator tokens.
   *
   * @param params - Removal parameters
   * @returns Transaction result with tokens received
   * @throws Error if wallet not configured or transaction fails
   */
  async removeLiquidity(params: {
    userToken: Address;
    validatorToken?: Address;
    lpAmount: bigint;
  }): Promise<RemoveLiquidityResult> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    const { userToken, lpAmount } = params;
    const validatorToken = params.validatorToken ?? PATH_USD_ADDRESS;

    try {
      const hash = await walletClient.writeContract({
        address: FEE_AMM_ADDRESS,
        abi: FEE_AMM_ABI,
        functionName: 'burn',
        args: [userToken, validatorToken, lpAmount],
        feeToken: this.feeToken,
      } as Parameters<typeof walletClient.writeContract>[0]);

      const receipt = await this.client.waitForTransaction(hash);

      // Parse amounts received from event
      const { amountUser, amountValidator } = this.parseBurnEvent(receipt);

      return {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasCost: receipt.gasUsed.toString(),
        lpTokensBurned: lpAmount,
        userTokenReceived: amountUser,
        validatorTokenReceived: amountValidator,
      };
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('InsufficientLiquidity')) {
        throw BlockchainError.transactionReverted(
          'Insufficient LP token balance to remove liquidity'
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Approve a token for spending by the Fee AMM.
   *
   * @param token - Token address to approve
   * @param amount - Amount to approve
   */
  private async approveToken(token: Address, amount: bigint): Promise<void> {
    const walletClient = this.client['walletClient'];
    if (!walletClient) {
      throw InternalError.walletNotConfigured();
    }

    // Check current allowance
    const allowance = await this.publicClient.readContract({
      address: token,
      abi: ERC20_APPROVAL_ABI,
      functionName: 'allowance',
      args: [this.client.getAddress(), FEE_AMM_ADDRESS],
    }) as bigint;

    // Skip if already approved
    if (allowance >= amount) {
      return;
    }

    // Approve the Fee AMM to spend tokens
    const hash = await walletClient.writeContract({
      address: token,
      abi: ERC20_APPROVAL_ABI,
      functionName: 'approve',
      args: [FEE_AMM_ADDRESS, amount],
      feeToken: this.feeToken,
    } as Parameters<typeof walletClient.writeContract>[0]);

    await this.client.waitForTransaction(hash);
  }

  /**
   * Parse Mint event from transaction receipt.
   *
   * @param receipt - Transaction receipt
   * @returns LP tokens minted
   */
  private parseMintEvent(receipt: { logs: readonly { topics: readonly string[]; data: string }[] }): bigint {
    // Look for Mint event
    // Topics: [eventSig, sender, userToken, validatorToken]
    // Data: [amountUser, amountValidator, lpTokens]
    for (const log of receipt.logs) {
      if (log.topics.length >= 4 && log.data && log.data.length >= 194) {
        try {
          // lpTokens is the third uint256 in data (at offset 128)
          const lpTokensHex = '0x' + log.data.slice(130, 194);
          return BigInt(lpTokensHex);
        } catch {
          // Continue to next log if parsing fails
        }
      }
    }
    return 0n;
  }

  /**
   * Parse Burn event from transaction receipt.
   *
   * @param receipt - Transaction receipt
   * @returns Amounts of user and validator tokens received
   */
  private parseBurnEvent(receipt: { logs: readonly { topics: readonly string[]; data: string }[] }): {
    amountUser: bigint;
    amountValidator: bigint;
  } {
    // Look for Burn event
    // Topics: [eventSig, sender, userToken, validatorToken]
    // Data: [lpAmount, amountUser, amountValidator]
    for (const log of receipt.logs) {
      if (log.topics.length >= 4 && log.data && log.data.length >= 194) {
        try {
          // amountUser is the second uint256 in data (at offset 64)
          const amountUserHex = '0x' + log.data.slice(66, 130);
          // amountValidator is the third uint256 in data (at offset 128)
          const amountValidatorHex = '0x' + log.data.slice(130, 194);
          return {
            amountUser: BigInt(amountUserHex),
            amountValidator: BigInt(amountValidatorHex),
          };
        } catch {
          // Continue to next log if parsing fails
        }
      }
    }
    return { amountUser: 0n, amountValidator: 0n };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: FeeAmmService | null = null;

/**
 * Get or create the singleton FeeAmmService instance.
 *
 * @returns The shared FeeAmmService instance
 */
export function getFeeAmmService(): FeeAmmService {
  if (!serviceInstance) {
    serviceInstance = new FeeAmmService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetFeeAmmService(): void {
  serviceInstance = null;
}

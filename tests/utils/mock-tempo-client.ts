/**
 * Mock Tempo Client Utilities
 *
 * Provides mocked versions of the Tempo blockchain client for testing.
 * These mocks allow testing blockchain-dependent code without network calls.
 */

import { vi } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { TEST_ADDRESSES, TEST_CONTRACTS, TEST_TOKENS, TEST_TX_HASHES } from './test-helpers.js';

// =============================================================================
// Event Signatures (must match the actual signatures used in dex-advanced-service)
// =============================================================================

/** OrderPlaced event signature */
const ORDER_PLACED_SIGNATURE = keccak256(
  toBytes('OrderPlaced(uint128,address,address,uint128,bool,int16)')
);

/** FlipOrderPlaced event signature */
const FLIP_ORDER_PLACED_SIGNATURE = keccak256(
  toBytes('FlipOrderPlaced(uint128,address,address,uint128,bool,int16,int16)')
);

// =============================================================================
// Types
// =============================================================================

/**
 * Mock transaction receipt.
 */
export interface MockTransactionReceipt {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  contractAddress: `0x${string}` | null;
  status: 'success' | 'reverted';
  gasUsed: bigint;
  logs: readonly { address: `0x${string}`; topics: readonly string[]; data: string }[];
}

/**
 * Options for creating a mock tempo client.
 */
export interface MockTempoClientOptions {
  /** Balance to return for balance queries (default: 1000 * 10^6) */
  balance?: bigint;
  /** Whether operations should fail */
  shouldFail?: boolean;
  /** Error message when failing */
  failMessage?: string;
  /** Specific method to fail on */
  failOnMethod?: string;
  /** Gas estimate to return */
  gasEstimate?: bigint;
  /** Transaction hash to return */
  txHash?: `0x${string}`;
  /** Block number for queries */
  blockNumber?: bigint;
  /** Token decimals */
  tokenDecimals?: number;
  /** Token symbol */
  tokenSymbol?: string;
  /** Whether the token is paused */
  isPaused?: boolean;
  /** Role members to return for role queries */
  roleMembers?: Record<string, string[]>;
  /** Whether address has specific role */
  hasRole?: boolean;
  /** Rewards-related mock data */
  rewards?: {
    /** Whether address is opted into rewards */
    isOptedIn?: boolean;
    /** Pending rewards amount */
    pendingRewards?: bigint;
    /** Opted-in balance */
    optedInBalance?: bigint;
    /** Reward recipient address (null for none) */
    rewardRecipient?: string | null;
    /** Total rewards claimed */
    totalClaimed?: bigint;
    /** Total opted-in supply */
    totalOptedInSupply?: bigint;
    /** Total rewards distributed */
    totalDistributed?: bigint;
  };
  /** Fee AMM-related mock data */
  feeAmm?: {
    /** User token reserve in pool */
    reserveUser?: bigint;
    /** Validator token reserve in pool */
    reserveValidator?: bigint;
    /** Total LP token supply */
    totalLpSupply?: bigint;
    /** LP token balance for account */
    lpBalance?: bigint;
    /** Quote output for swaps */
    quoteOutput?: bigint;
    /** LP tokens minted on add liquidity */
    lpTokensMinted?: bigint;
    /** Token allowance for approvals */
    allowance?: bigint;
  };
  /** DEX Advanced orderbook mock data */
  dex?: {
    /** Active order ID counter */
    activeOrderId?: bigint;
    /** Order data for getOrder queries */
    orders?: Map<bigint, {
      maker: `0x${string}`;
      bookKey: `0x${string}`;
      isBid: boolean;
      tick: number;
      amount: bigint;
      remaining: bigint;
      isFlip: boolean;
    }>;
    /** Tick level liquidity */
    tickLevels?: Map<string, { head: bigint; tail: bigint; totalLiquidity: bigint }>;
    /** Best bid tick */
    bestBidTick?: number;
    /** Best ask tick */
    bestAskTick?: number;
    /** DEX balance for a token */
    dexBalance?: bigint;
    /** Token allowance for DEX */
    allowance?: bigint;
    /** Order ID to return on place */
    newOrderId?: bigint;
  };
}

// =============================================================================
// Mock Client Factory
// =============================================================================

/**
 * Create a mock Tempo client with configurable behavior.
 *
 * @param options - Configuration options for the mock
 * @returns Mocked client object
 */
export function createMockTempoClient(options: MockTempoClientOptions = {}) {
  const {
    balance = BigInt(1000 * 1e6), // 1000 tokens with 6 decimals
    shouldFail = false,
    failMessage = 'Mock error',
    failOnMethod,
    gasEstimate = BigInt(21000),
    txHash = TEST_TX_HASHES.VALID as `0x${string}`,
    blockNumber = BigInt(12345),
    tokenDecimals = 6,
    tokenSymbol = 'AlphaUSD',
    isPaused = false,
    roleMembers = {},
    hasRole = true,
    rewards = {},
    feeAmm = {},
    dex = {},
  } = options;

  // Default Fee AMM values
  const feeAmmDefaults = {
    reserveUser: feeAmm.reserveUser ?? BigInt(1000000 * 1e6), // 1M tokens
    reserveValidator: feeAmm.reserveValidator ?? BigInt(1000000 * 1e6), // 1M tokens
    totalLpSupply: feeAmm.totalLpSupply ?? BigInt(2000000 * 1e6), // 2M LP tokens
    lpBalance: feeAmm.lpBalance ?? BigInt(10000 * 1e6), // 10K LP tokens
    quoteOutput: feeAmm.quoteOutput ?? BigInt(998500), // ~0.9985 rate for 1M input
    lpTokensMinted: feeAmm.lpTokensMinted ?? BigInt(10000 * 1e6), // 10K LP tokens
    allowance: feeAmm.allowance ?? BigInt(0), // No allowance by default
  };

  // Default rewards values
  const rewardsDefaults = {
    isOptedIn: rewards.isOptedIn ?? false,
    pendingRewards: rewards.pendingRewards ?? BigInt(100 * 1e6), // 100 tokens
    optedInBalance: rewards.optedInBalance ?? balance,
    rewardRecipient: rewards.rewardRecipient ?? null,
    totalClaimed: rewards.totalClaimed ?? BigInt(50 * 1e6), // 50 tokens
    totalOptedInSupply: rewards.totalOptedInSupply ?? BigInt(1000000 * 1e6), // 1M tokens
    totalDistributed: rewards.totalDistributed ?? BigInt(10000 * 1e6), // 10K tokens
  };

  // Default DEX values
  const dexDefaults = {
    activeOrderId: dex.activeOrderId ?? BigInt(100),
    orders: dex.orders ?? new Map(),
    tickLevels: dex.tickLevels ?? new Map(),
    bestBidTick: dex.bestBidTick ?? -10,
    bestAskTick: dex.bestAskTick ?? 10,
    dexBalance: dex.dexBalance ?? BigInt(0),
    allowance: dex.allowance ?? BigInt(1000000 * 1e6), // Pre-approved by default
    newOrderId: dex.newOrderId ?? BigInt(101),
  };

  const maybeThrow = (method: string) => {
    if (shouldFail && (!failOnMethod || failOnMethod === method)) {
      throw new Error(failMessage);
    }
  };

  return {
    // Wallet address
    getAddress: vi.fn().mockReturnValue(TEST_ADDRESSES.VALID),

    // Balance queries
    getBalance: vi.fn().mockImplementation(() => {
      maybeThrow('getBalance');
      return balance;
    }),

    // Token metadata
    getTokenDecimals: vi.fn().mockImplementation(() => {
      maybeThrow('getTokenDecimals');
      return tokenDecimals;
    }),

    getTokenSymbol: vi.fn().mockImplementation(() => {
      maybeThrow('getTokenSymbol');
      return tokenSymbol;
    }),

    // Transfers
    sendTransfer: vi.fn().mockImplementation(() => {
      maybeThrow('sendTransfer');
      return txHash;
    }),

    sendTransferWithMemo: vi.fn().mockImplementation(() => {
      maybeThrow('sendTransferWithMemo');
      return txHash;
    }),

    // Generic payment method for integration tests
    sendPayment: vi.fn().mockImplementation(
      (params: { token: string; to: string; amount: string; memo?: string }) => {
        maybeThrow('sendPayment');
        return { hash: txHash };
      }
    ),

    // Batch transfers
    sendBatchTransfer: vi.fn().mockImplementation(() => {
      maybeThrow('sendBatchTransfer');
      return txHash;
    }),

    // Transaction waiting
    waitForTransaction: vi.fn().mockImplementation(() => {
      maybeThrow('waitForTransaction');
      return createMockReceipt(txHash);
    }),

    // Gas estimation
    estimateGas: vi.fn().mockImplementation(() => {
      maybeThrow('estimateGas');
      return gasEstimate;
    }),

    // Block number
    getBlockNumber: vi.fn().mockImplementation(() => {
      maybeThrow('getBlockNumber');
      return blockNumber;
    }),

    // Batch transactions (used by DEX service)
    sendBatch: vi.fn().mockImplementation(() => {
      maybeThrow('sendBatch');
      return txHash;
    }),

    // Tempo transaction support (for access key operations)
    sendTempoTransaction: vi.fn().mockImplementation(() => {
      maybeThrow('sendTempoTransaction');
      return txHash;
    }),

    // Public client (for read operations)
    publicClient: {
      getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
      getBalance: vi.fn().mockResolvedValue(balance),
      getStorageAt: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000000'),
      readContract: vi.fn().mockImplementation(
        ({
          functionName,
          args,
        }: {
          functionName: string;
          args?: unknown[];
        }) => {
          maybeThrow('readContract');
          // Handle role-related contract calls
          if (functionName === 'hasRole') {
            return Promise.resolve(hasRole);
          }
          if (functionName === 'paused') {
            return Promise.resolve(isPaused);
          }
          if (functionName === 'getRoleMemberCount') {
            const roleHash = args?.[0] as string;
            const members = roleMembers[roleHash] || [];
            return Promise.resolve(BigInt(members.length));
          }
          if (functionName === 'getRoleMember') {
            const roleHash = args?.[0] as string;
            const index = Number(args?.[1] ?? 0);
            const members = roleMembers[roleHash] || [];
            return Promise.resolve(members[index] ?? TEST_ADDRESSES.VALID);
          }
          // Handle Fee AMM balanceOf with 3 args BEFORE generic balanceOf
          // Fee AMM balanceOf(userToken, validatorToken, account)
          if (functionName === 'balanceOf' && args && args.length === 3) {
            return Promise.resolve(feeAmmDefaults.lpBalance);
          }
          // Default: return balance for balanceOf (1 arg - token balanceOf(account))
          if (functionName === 'balanceOf') {
            return Promise.resolve(balance);
          }
          if (functionName === 'decimals') {
            return Promise.resolve(tokenDecimals);
          }
          if (functionName === 'symbol') {
            return Promise.resolve(tokenSymbol);
          }
          // Handle rewards-related contract calls
          // userRewardInfo returns (rewardRecipient, rewardPerToken, rewardBalance)
          // - rewardRecipient != 0x0 means user is opted in
          // - rewardBalance is pending claimable rewards
          if (functionName === 'userRewardInfo') {
            const zeroAddress = '0x0000000000000000000000000000000000000000';
            // Determine recipient:
            // - If explicit rewardRecipient is set, use it (allows testing specific recipient)
            // - Otherwise, if opted in, use caller's address
            // - If not opted in, use zero address
            let recipient: string;
            if (rewardsDefaults.rewardRecipient !== null) {
              recipient = rewardsDefaults.rewardRecipient;
            } else if (rewardsDefaults.isOptedIn) {
              recipient = TEST_ADDRESSES.VALID;
            } else {
              recipient = zeroAddress;
            }
            return Promise.resolve([
              recipient, // rewardRecipient
              BigInt(0), // rewardPerToken (not used in our tests)
              rewardsDefaults.pendingRewards, // rewardBalance (pending rewards)
            ]);
          }
          // optedInSupply returns total supply opted into rewards
          if (functionName === 'optedInSupply') {
            return Promise.resolve(rewardsDefaults.totalOptedInSupply);
          }
          // Legacy function names for backwards compatibility in other tests
          if (functionName === 'isOptedInRewards') {
            return Promise.resolve(rewardsDefaults.isOptedIn);
          }
          if (functionName === 'pendingRewards') {
            return Promise.resolve(rewardsDefaults.pendingRewards);
          }
          if (functionName === 'optedInBalance') {
            return Promise.resolve(rewardsDefaults.optedInBalance);
          }
          if (functionName === 'rewardRecipient') {
            const zeroAddress = '0x0000000000000000000000000000000000000000';
            return Promise.resolve(rewardsDefaults.rewardRecipient ?? zeroAddress);
          }
          if (functionName === 'totalRewardsClaimed') {
            return Promise.resolve(rewardsDefaults.totalClaimed);
          }
          if (functionName === 'totalOptedInSupply') {
            return Promise.resolve(rewardsDefaults.totalOptedInSupply);
          }
          if (functionName === 'totalRewardsDistributed') {
            return Promise.resolve(rewardsDefaults.totalDistributed);
          }
          // Handle Fee AMM contract calls
          if (functionName === 'getPool') {
            return Promise.resolve([
              feeAmmDefaults.reserveUser,
              feeAmmDefaults.reserveValidator,
              feeAmmDefaults.totalLpSupply,
            ]);
          }
          if (functionName === 'quote') {
            return Promise.resolve(feeAmmDefaults.quoteOutput);
          }
          if (functionName === 'allowance') {
            return Promise.resolve(feeAmmDefaults.allowance);
          }
          // Handle DEX contract calls
          if (functionName === 'activeOrderId') {
            return Promise.resolve(dexDefaults.activeOrderId);
          }
          if (functionName === 'pendingOrderId') {
            return Promise.resolve(dexDefaults.activeOrderId);
          }
          // DEX balanceOf with 2 args (user, token)
          if (functionName === 'balanceOf' && args && args.length === 2) {
            return Promise.resolve(dexDefaults.dexBalance);
          }
          if (functionName === 'pairKey') {
            // Return a mock pair key
            return Promise.resolve('0x' + 'ab'.repeat(32) as `0x${string}`);
          }
          if (functionName === 'books') {
            // Return mock book info (base, quote, bestBidTick, bestAskTick)
            const baseToken = TEST_TOKENS.ALPHA_USD as `0x${string}`;
            const quoteToken = TEST_TOKENS.PATH_USD as `0x${string}`;
            return Promise.resolve([
              baseToken,
              quoteToken,
              dexDefaults.bestBidTick,
              dexDefaults.bestAskTick,
            ]);
          }
          if (functionName === 'getTickLevel') {
            // Return mock tick level data (head, tail, totalLiquidity)
            const tick = args?.[1] as number;
            const isBid = args?.[2] as boolean;
            const key = `${tick}:${isBid}`;
            const level = dexDefaults.tickLevels.get(key);
            if (level) {
              return Promise.resolve([level.head, level.tail, level.totalLiquidity]);
            }
            // Return some default liquidity
            return Promise.resolve([BigInt(0), BigInt(0), BigInt(1000 * 1e6)]);
          }
          return Promise.resolve(undefined);
        }
      ),
      waitForTransactionReceipt: vi.fn().mockImplementation(() => {
        maybeThrow('waitForTransactionReceipt');
        // Include claimed amount in logs for rewards claim transactions
        return Promise.resolve(createMockReceipt(txHash, {
          claimedAmount: rewardsDefaults.pendingRewards,
        }));
      }),
    },

    // Wallet client (for write operations)
    walletClient: {
      writeContract: vi.fn().mockImplementation(() => {
        maybeThrow('writeContract');
        return txHash;
      }),
      sendTransaction: vi.fn().mockImplementation(() => {
        maybeThrow('sendTransaction');
        return txHash;
      }),
    },

    // Fee token for gas payments
    feeToken: TEST_TOKENS.ALPHA_USD as `0x${string}`,

    // Concurrent transaction support
    sendConcurrentTransaction: vi.fn().mockImplementation(
      (params: { to: string; data: string; nonce: number; nonceKey: number }) => {
        maybeThrow('sendConcurrentTransaction');
        // Generate unique hash per nonceKey for testing
        const keyHex = params.nonceKey.toString(16).padStart(2, '0');
        return `0x${keyHex}${'a'.repeat(62)}` as `0x${string}`;
      }
    ),
  };
}

// =============================================================================
// Mock Receipt Factory
// =============================================================================

/**
 * Create a mock transaction receipt.
 *
 * @param txHash - Transaction hash
 * @param options - Additional options
 */
export function createMockReceipt(
  txHash: `0x${string}` = TEST_TX_HASHES.VALID as `0x${string}`,
  options: {
    status?: 'success' | 'reverted';
    blockNumber?: bigint;
    gasUsed?: bigint;
    claimedAmount?: bigint;
    lpTokensMinted?: bigint;
    burnAmounts?: { amountUser: bigint; amountValidator: bigint };
    /** DEX order ID for OrderPlaced events */
    orderId?: bigint;
  } = {}
): MockTransactionReceipt {
  // Create mock event logs based on options
  const logs: { address: `0x${string}`; topics: readonly string[]; data: string }[] = [];

  // RewardsClaimed event log
  if (options.claimedAmount !== undefined) {
    // RewardsClaimed(address indexed account, uint256 amount, address indexed recipient)
    // topics[0] = event signature hash, topics[1] = account, topics[2] = recipient
    // data = amount (uint256)
    const amountHex = options.claimedAmount.toString(16).padStart(64, '0');
    logs.push({
      address: TEST_CONTRACTS.REWARDS as `0x${string}`,
      topics: [
        '0x' + 'a'.repeat(64), // Event signature (mock)
        '0x' + '0'.repeat(24) + TEST_ADDRESSES.VALID.slice(2), // Indexed account
        '0x' + '0'.repeat(24) + TEST_ADDRESSES.VALID.slice(2), // Indexed recipient
      ],
      data: '0x' + amountHex,
    });
  }

  // Fee AMM Mint event log
  if (options.lpTokensMinted !== undefined) {
    // Mint(sender, userToken, validatorToken, amountUser, amountValidator, lpTokens)
    const amountUserHex = (BigInt(10000) * BigInt(1e6)).toString(16).padStart(64, '0');
    const amountValidatorHex = (BigInt(10000) * BigInt(1e6)).toString(16).padStart(64, '0');
    const lpTokensHex = options.lpTokensMinted.toString(16).padStart(64, '0');
    logs.push({
      address: TEST_CONTRACTS.FEE_AMM as `0x${string}`,
      topics: [
        '0x' + 'b'.repeat(64), // Event signature (mock)
        '0x' + '0'.repeat(24) + TEST_ADDRESSES.VALID.slice(2), // Indexed sender
        '0x' + '0'.repeat(24) + TEST_TOKENS.ALPHA_USD.slice(2), // Indexed userToken
        '0x' + '0'.repeat(24) + TEST_TOKENS.PATH_USD.slice(2), // Indexed validatorToken
      ],
      data: '0x' + amountUserHex + amountValidatorHex + lpTokensHex,
    });
  }

  // Fee AMM Burn event log
  if (options.burnAmounts !== undefined) {
    // Burn(sender, userToken, validatorToken, lpAmount, amountUser, amountValidator)
    const lpAmountHex = (BigInt(5000) * BigInt(1e6)).toString(16).padStart(64, '0');
    const amountUserHex = options.burnAmounts.amountUser.toString(16).padStart(64, '0');
    const amountValidatorHex = options.burnAmounts.amountValidator.toString(16).padStart(64, '0');
    logs.push({
      address: TEST_CONTRACTS.FEE_AMM as `0x${string}`,
      topics: [
        '0x' + 'c'.repeat(64), // Event signature (mock)
        '0x' + '0'.repeat(24) + TEST_ADDRESSES.VALID.slice(2), // Indexed sender
        '0x' + '0'.repeat(24) + TEST_TOKENS.ALPHA_USD.slice(2), // Indexed userToken
        '0x' + '0'.repeat(24) + TEST_TOKENS.PATH_USD.slice(2), // Indexed validatorToken
      ],
      data: '0x' + lpAmountHex + amountUserHex + amountValidatorHex,
    });
  }

  // DEX OrderPlaced event log
  if (options.orderId !== undefined) {
    // OrderPlaced(orderId indexed, maker indexed, token indexed, amount, isBid, tick)
    const orderIdHex = options.orderId.toString(16).padStart(64, '0');
    logs.push({
      address: TEST_CONTRACTS.DEX as `0x${string}`,
      topics: [
        ORDER_PLACED_SIGNATURE, // Real event signature
        '0x' + orderIdHex, // Indexed orderId
        '0x' + '0'.repeat(24) + TEST_ADDRESSES.VALID.slice(2), // Indexed maker
        '0x' + '0'.repeat(24) + TEST_TOKENS.ALPHA_USD.slice(2), // Indexed token
      ],
      data: '0x' + '0'.repeat(64), // Non-indexed data
    });
  }

  return {
    transactionHash: txHash,
    blockNumber: options.blockNumber ?? BigInt(12345),
    blockHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    from: TEST_ADDRESSES.VALID as `0x${string}`,
    to: TEST_TOKENS.ALPHA_USD as `0x${string}`,
    contractAddress: null,
    status: options.status ?? 'success',
    gasUsed: options.gasUsed ?? BigInt(21000),
    logs,
  };
}

// =============================================================================
// Preset Mock Configurations
// =============================================================================

/**
 * Create a mock client that always succeeds.
 */
export function createSuccessfulMockClient() {
  return createMockTempoClient({
    shouldFail: false,
    balance: BigInt(1000000 * 1e6), // 1M tokens
  });
}

/**
 * Create a mock client that fails on all operations.
 */
export function createFailingMockClient(message = 'Transaction failed') {
  return createMockTempoClient({
    shouldFail: true,
    failMessage: message,
  });
}

/**
 * Create a mock client with insufficient balance.
 */
export function createInsufficientBalanceMockClient() {
  return createMockTempoClient({
    balance: BigInt(0),
    shouldFail: true,
    failOnMethod: 'sendTransfer',
    failMessage: 'Insufficient balance',
  });
}

/**
 * Create a mock client that times out.
 */
export function createTimeoutMockClient() {
  return createMockTempoClient({
    shouldFail: true,
    failOnMethod: 'waitForTransaction',
    failMessage: 'Transaction confirmation timeout',
  });
}

// =============================================================================
// Vitest Mock Setup Helpers
// =============================================================================

/**
 * Current mock client instance.
 */
let currentMockClient: ReturnType<typeof createMockTempoClient> | null = null;

/**
 * Set the mock client to use.
 */
export function setMockClient(
  client: ReturnType<typeof createMockTempoClient>
): void {
  currentMockClient = client;
}

/**
 * Get the current mock client.
 */
export function getMockClient() {
  if (!currentMockClient) {
    currentMockClient = createMockTempoClient();
  }
  return currentMockClient;
}

/**
 * Reset the mock client.
 */
export function resetMockClient(): void {
  currentMockClient = null;
}

/**
 * Create a mock for the tempo-client module.
 *
 * @example
 * ```typescript
 * import { vi, beforeEach, afterEach } from 'vitest';
 * import { createTempoClientMock, resetMockClient } from './mock-tempo-client.js';
 *
 * beforeEach(() => {
 *   vi.mock('../../src/services/tempo-client.js', () => createTempoClientMock());
 * });
 *
 * afterEach(() => {
 *   vi.restoreAllMocks();
 *   resetMockClient();
 * });
 * ```
 */
export function createTempoClientMock() {
  return {
    getTempoClient: () => getMockClient(),
    resetTempoClient: vi.fn(),
  };
}

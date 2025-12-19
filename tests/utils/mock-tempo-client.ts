/**
 * Mock Tempo Client Utilities
 *
 * Provides mocked versions of the Tempo blockchain client for testing.
 * These mocks allow testing blockchain-dependent code without network calls.
 */

import { vi } from 'vitest';
import { TEST_ADDRESSES, TEST_TOKENS, TEST_TX_HASHES } from './test-helpers.js';

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
  } = options;

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

    // Public client (for read operations)
    publicClient: {
      getBlockNumber: vi.fn().mockReturnValue(blockNumber),
      getBalance: vi.fn().mockReturnValue(balance),
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockImplementation(() => {
        maybeThrow('waitForTransactionReceipt');
        return createMockReceipt(txHash);
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
  } = {}
): MockTransactionReceipt {
  return {
    transactionHash: txHash,
    blockNumber: options.blockNumber ?? BigInt(12345),
    blockHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    from: TEST_ADDRESSES.VALID as `0x${string}`,
    to: TEST_TOKENS.ALPHA_USD as `0x${string}`,
    contractAddress: null,
    status: options.status ?? 'success',
    gasUsed: options.gasUsed ?? BigInt(21000),
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

/**
 * Token Service
 *
 * Handles TIP-20 token operations on the Tempo blockchain:
 * - Create new tokens via TIP-20 Factory
 * - Query token metadata
 * - Mint tokens (requires ISSUER_ROLE)
 * - Burn tokens (requires ISSUER_ROLE)
 */

import {
  formatUnits,
  decodeEventLog,
  type Address,
  type Hash,
} from 'viem';
import {
  getTempoClient,
  TIP20_ABI,
  TIP20_FACTORY_ABI,
  TIP20_ERROR_SIGNATURES,
} from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { ValidationError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** TIP-20 tokens always have 6 decimals */
const TIP20_DECIMALS = 6;

/**
 * Extract a friendly error message from a contract revert.
 * Checks for known TIP-20 error signatures.
 */
function getFriendlyErrorMessage(error: unknown): string | null {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check for known error signatures
  for (const [signature, description] of Object.entries(TIP20_ERROR_SIGNATURES)) {
    if (errorMessage.includes(signature)) {
      return description;
    }
  }

  // Check for Unauthorized pattern (signature 0x82b42900)
  if (errorMessage.includes('0x82b42900')) {
    return 'Unauthorized - caller does not have the required role. Use grant_role to assign ISSUER_ROLE before minting.';
  }

  return null;
}

// =============================================================================
// Types
// =============================================================================

export interface CreateTokenParams {
  name: string;
  symbol: string;
  currency: string;
  quoteToken?: Address;
}

export interface CreateTokenResult {
  tokenAddress: Address;
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  totalSupplyRaw: string;
}

export interface MintTokensParams {
  token: Address;
  to: Address;
  amount: bigint;
  memo?: `0x${string}`;
}

export interface BurnTokensParams {
  token: Address;
  amount: bigint;
  memo?: `0x${string}`;
}

export interface TokenOperationResult {
  hash: Hash;
  blockNumber: number;
  gasCost: string;
}

// =============================================================================
// TokenService Class
// =============================================================================

/**
 * Service for TIP-20 token operations.
 *
 * @example
 * ```typescript
 * const service = getTokenService();
 *
 * // Create a new token
 * const { tokenAddress, hash } = await service.createToken({
 *   name: 'Acme Dollar',
 *   symbol: 'ACME',
 *   currency: 'USD',
 * });
 *
 * // Get token info
 * const info = await service.getTokenInfo(tokenAddress);
 *
 * // Mint tokens (requires ISSUER_ROLE)
 * await service.mintTokens({
 *   token: tokenAddress,
 *   to: recipientAddress,
 *   amount: parseUnits('1000', 6),
 * });
 * ```
 */
export class TokenService {
  // ===========================================================================
  // Create Token
  // ===========================================================================

  /**
   * Create a new TIP-20 token via the factory contract.
   *
   * The caller becomes the admin of the new token and receives:
   * - DEFAULT_ADMIN_ROLE (can manage roles)
   * - ISSUER_ROLE (can mint/burn)
   *
   * @param params - Token creation parameters
   * @returns Created token address, transaction hash, and block number
   * @throws BlockchainError if the transaction fails
   */
  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    const client = getTempoClient();
    const config = getConfig();

    const factoryAddress = config.contracts.tip20Factory as Address;
    const quoteToken =
      (params.quoteToken as Address) ?? (config.contracts.pathUSD as Address);
    const adminAddress = client.getAddress();

    // Call factory's createToken function
    const hash = await client['walletClient']!.writeContract({
      address: factoryAddress,
      abi: TIP20_FACTORY_ABI,
      functionName: 'createToken',
      args: [
        params.name,
        params.symbol,
        params.currency,
        quoteToken,
        adminAddress,
      ],
      feeToken: client['feeToken'],
    } as Parameters<
      NonNullable<(typeof client)['walletClient']>['writeContract']
    >[0]);

    // Wait for transaction confirmation
    const receipt = await client.waitForTransaction(hash);

    // Parse TokenCreated event to get the new token address
    const tokenAddress = this.parseTokenCreatedEvent(receipt);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCost = formatUnits(gasUsed * gasPrice, TIP20_DECIMALS);

    return {
      tokenAddress,
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
    };
  }

  /**
   * Parse the TokenCreated event from the transaction receipt.
   *
   * TokenCreated event signature:
   *   event TokenCreated(address indexed token, uint256 indexed id, string name,
   *                      string symbol, string currency, address indexed quoteToken, address admin)
   *
   * Topics layout:
   *   topics[0] = event signature hash
   *   topics[1] = token address (indexed)
   *   topics[2] = id (indexed)
   *   topics[3] = quoteToken (indexed)
   */
  private parseTokenCreatedEvent(
    receipt: Awaited<ReturnType<ReturnType<typeof getTempoClient>['waitForTransaction']>>
  ): Address {
    for (const log of receipt.logs) {
      // Method 1: Try standard decodeEventLog
      try {
        const decoded = decodeEventLog({
          abi: TIP20_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'TokenCreated') {
          return (decoded.args as { token: Address }).token;
        }
      } catch {
        // Continue to fallback methods
      }

      // Method 2: Try extracting token address from topics[1] directly
      // The token address is the first indexed parameter after the event signature
      if (log.topics && log.topics.length >= 2) {
        try {
          // topics[1] contains the token address (padded to 32 bytes)
          const tokenTopic = log.topics[1];
          if (tokenTopic && tokenTopic.length === 66) {
            // Extract address from last 40 characters (20 bytes)
            const potentialAddress = ('0x' + tokenTopic.slice(-40)) as Address;

            // Verify it looks like a valid TIP-20 address (starts with 0x20c)
            // TIP-20 tokens are in the 0x20c... address range
            if (potentialAddress.toLowerCase().startsWith('0x20c')) {
              return potentialAddress;
            }
          }
        } catch {
          // Continue searching
        }
      }
    }

    // Method 3: Look for any address in the 0x20c range in all topics
    for (const log of receipt.logs) {
      if (log.topics) {
        for (const topic of log.topics) {
          if (topic && topic.length === 66) {
            const potentialAddress = ('0x' + topic.slice(-40)) as Address;
            if (potentialAddress.toLowerCase().startsWith('0x20c0')) {
              // This looks like a TIP-20 token address
              return potentialAddress;
            }
          }
        }
      }
    }

    // Include debug info in error
    const logsSummary = receipt.logs.map((log, i) => ({
      index: i,
      address: log.address,
      topicsCount: log.topics?.length ?? 0,
      topics: log.topics?.slice(0, 2), // First 2 topics for debugging
    }));

    throw new BlockchainError(
      3010,
      'Failed to parse TokenCreated event from transaction receipt',
      {
        recoverable: false,
        details: {
          suggestion: 'Check the transaction logs manually',
          logsCount: receipt.logs.length,
          logsSummary: JSON.stringify(logsSummary),
        },
      }
    );
  }

  // ===========================================================================
  // Get Token Info
  // ===========================================================================

  /**
   * Get metadata for a TIP-20 token.
   *
   * @param tokenAddress - The token contract address
   * @returns Token metadata including name, symbol, decimals, and total supply
   * @throws ValidationError if the token is invalid
   */
  async getTokenInfo(tokenAddress: Address): Promise<TokenInfo> {
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    try {
      // Query all metadata in parallel for efficiency
      const [name, symbol, decimals, totalSupplyRaw] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'name',
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'symbol',
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'decimals',
        }) as Promise<number>,
        publicClient.readContract({
          address: tokenAddress,
          abi: TIP20_ABI,
          functionName: 'totalSupply',
        }) as Promise<bigint>,
      ]);

      const totalSupply = formatUnits(totalSupplyRaw, decimals);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        totalSupply,
        totalSupplyRaw: totalSupplyRaw.toString(),
      };
    } catch (error) {
      throw ValidationError.invalidToken(tokenAddress);
    }
  }

  // ===========================================================================
  // Mint Tokens
  // ===========================================================================

  /**
   * Mint new tokens to an address.
   *
   * Requires the caller to have ISSUER_ROLE on the token contract.
   * The admin who created the token automatically has this role.
   *
   * @param params - Mint parameters (token, recipient, amount, optional memo)
   * @returns Transaction hash and block number
   * @throws BlockchainError if the transaction fails (likely missing ISSUER_ROLE)
   */
  async mintTokens(params: MintTokensParams): Promise<TokenOperationResult> {
    const client = getTempoClient();

    if (!client['walletClient']) {
      throw new BlockchainError(
        3005,
        'Wallet not configured. Set TEMPO_PRIVATE_KEY environment variable.',
        { recoverable: false }
      );
    }

    let hash: Hash;

    try {
      if (params.memo) {
        // Use mintWithMemo for tracking
        hash = await client['walletClient'].writeContract({
          address: params.token,
          abi: TIP20_ABI,
          functionName: 'mintWithMemo',
          args: [params.to, params.amount, params.memo],
          feeToken: client['feeToken'],
        } as Parameters<
          NonNullable<(typeof client)['walletClient']>['writeContract']
        >[0]);
      } else {
        // Use standard mint
        hash = await client['walletClient'].writeContract({
          address: params.token,
          abi: TIP20_ABI,
          functionName: 'mint',
          args: [params.to, params.amount],
          feeToken: client['feeToken'],
        } as Parameters<
          NonNullable<(typeof client)['walletClient']>['writeContract']
        >[0]);
      }
    } catch (error) {
      // Check for known TIP-20 errors
      const friendlyMessage = getFriendlyErrorMessage(error);
      if (friendlyMessage) {
        throw new BlockchainError(
          3006,
          `Mint failed: ${friendlyMessage}`,
          {
            recoverable: false,
            details: {
              suggestion:
                'Use the grant_role tool to assign ISSUER_ROLE to your wallet, then retry minting.',
            },
          }
        );
      }

      // Check if error is due to missing ISSUER_ROLE (legacy check)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('AccessControl')
      ) {
        throw new BlockchainError(
          3006,
          'Mint failed: caller does not have ISSUER_ROLE on this token',
          {
            recoverable: false,
            details: {
              suggestion:
                'Use the grant_role tool to assign ISSUER_ROLE to your wallet, then retry minting.',
            },
          }
        );
      }
      throw new BlockchainError(
        3003,
        `Mint transaction failed: ${errorMessage}`,
        { recoverable: false }
      );
    }

    // Wait for confirmation
    const receipt = await client.waitForTransaction(hash);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCost = formatUnits(gasUsed * gasPrice, TIP20_DECIMALS);

    return {
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
    };
  }

  // ===========================================================================
  // Burn Tokens
  // ===========================================================================

  /**
   * Burn tokens from the caller's balance.
   *
   * Requires the caller to have ISSUER_ROLE on the token contract.
   * The admin who created the token automatically has this role.
   *
   * @param params - Burn parameters (token, amount, optional memo)
   * @returns Transaction hash and block number
   * @throws BlockchainError if the transaction fails
   */
  async burnTokens(params: BurnTokensParams): Promise<TokenOperationResult> {
    const client = getTempoClient();

    if (!client['walletClient']) {
      throw new BlockchainError(
        3005,
        'Wallet not configured. Set TEMPO_PRIVATE_KEY environment variable.',
        { recoverable: false }
      );
    }

    let hash: Hash;

    try {
      if (params.memo) {
        // Use burnWithMemo for tracking
        hash = await client['walletClient'].writeContract({
          address: params.token,
          abi: TIP20_ABI,
          functionName: 'burnWithMemo',
          args: [params.amount, params.memo],
          feeToken: client['feeToken'],
        } as Parameters<
          NonNullable<(typeof client)['walletClient']>['writeContract']
        >[0]);
      } else {
        // Use standard burn
        hash = await client['walletClient'].writeContract({
          address: params.token,
          abi: TIP20_ABI,
          functionName: 'burn',
          args: [params.amount],
          feeToken: client['feeToken'],
        } as Parameters<
          NonNullable<(typeof client)['walletClient']>['writeContract']
        >[0]);
      }
    } catch (error) {
      // Check for known TIP-20 errors
      const friendlyMessage = getFriendlyErrorMessage(error);
      if (friendlyMessage) {
        throw new BlockchainError(
          3006,
          `Burn failed: ${friendlyMessage}`,
          {
            recoverable: false,
            details: {
              suggestion:
                'Use the grant_role tool to assign ISSUER_ROLE to your wallet, then retry burning.',
            },
          }
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if error is due to missing ISSUER_ROLE
      if (
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('AccessControl')
      ) {
        throw new BlockchainError(
          3006,
          'Burn failed: caller does not have ISSUER_ROLE on this token',
          {
            recoverable: false,
            details: {
              suggestion:
                'Use the grant_role tool to assign ISSUER_ROLE to your wallet, then retry burning.',
            },
          }
        );
      }

      // Check if error is due to insufficient balance
      if (
        errorMessage.includes('insufficient') ||
        errorMessage.includes('balance')
      ) {
        throw BlockchainError.insufficientBalance(
          '0',
          params.amount.toString(),
          params.token
        );
      }

      throw new BlockchainError(
        3003,
        `Burn transaction failed: ${errorMessage}`,
        { recoverable: false }
      );
    }

    // Wait for confirmation
    const receipt = await client.waitForTransaction(hash);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCost = formatUnits(gasUsed * gasPrice, TIP20_DECIMALS);

    return {
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let serviceInstance: TokenService | null = null;

/**
 * Get or create the singleton TokenService instance.
 */
export function getTokenService(): TokenService {
  if (!serviceInstance) {
    serviceInstance = new TokenService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetTokenService(): void {
  serviceInstance = null;
}

// =============================================================================
// Helper: Resolve Token Address
// =============================================================================

/**
 * Resolve a token input (address or symbol) to a token address.
 *
 * @param tokenInput - Token address (0x...) or symbol (e.g., "AlphaUSD")
 * @returns Resolved token address
 * @throws ValidationError if the token cannot be resolved
 */
export function resolveTokenAddress(tokenInput: string): Address {
  // If already an address, validate and return
  if (tokenInput.startsWith('0x')) {
    if (tokenInput.length !== 42) {
      throw ValidationError.invalidToken(tokenInput);
    }
    return tokenInput as Address;
  }

  // Look up in config aliases
  const config = getConfig();
  const address = config.tokens.aliases[tokenInput];

  if (!address) {
    throw ValidationError.invalidToken(tokenInput);
  }

  return address as Address;
}

/**
 * Get token metadata (symbol and decimals) for formatting.
 *
 * @param tokenAddress - Token contract address
 * @returns Token metadata
 */
export async function getTokenMetadata(
  tokenAddress: Address
): Promise<{ symbol: string; decimals: number }> {
  const client = getTempoClient();
  const publicClient = client['publicClient'];

  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'symbol',
    }) as Promise<string>,
    publicClient.readContract({
      address: tokenAddress,
      abi: TIP20_ABI,
      functionName: 'decimals',
    }) as Promise<number>,
  ]);

  return { symbol, decimals };
}

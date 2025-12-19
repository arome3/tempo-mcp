/**
 * Balance Service
 *
 * Service for querying token balances and account information on Tempo blockchain.
 * Provides read-only operations that don't require a wallet private key.
 *
 * Features:
 * - Single and multi-token balance queries
 * - Token resolution (symbol or address)
 * - Account information with transaction count
 * - Parallel queries for efficiency
 */

import { formatUnits, type Address } from 'viem';
import { getTempoClient, TIP20_ABI } from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { ValidationError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Token balance information.
 */
export interface TokenBalance {
  /** Token contract address */
  token: Address;
  /** Token symbol (e.g., "AlphaUSD") */
  tokenSymbol: string;
  /** Token name (e.g., "Alpha USD") */
  tokenName: string;
  /** Human-readable balance (e.g., "100.50") */
  balance: string;
  /** Raw balance in wei (e.g., "100500000") */
  balanceRaw: string;
  /** Token decimals (e.g., 6) */
  decimals: number;
}

/**
 * Account information including balances.
 */
export interface AccountInfo {
  /** Account address */
  address: Address;
  /** Account type: externally owned account or contract */
  type: 'eoa' | 'contract';
  /** Non-zero token balances */
  balances: Array<{
    token: Address;
    tokenSymbol: string;
    balance: string;
  }>;
  /** Total transactions from this address */
  transactionCount: number;
  /** Timestamp of first activity (null if no indexer) */
  firstSeen: string | null;
  /** Timestamp of last activity (null if no indexer) */
  lastActive: string | null;
}

// =============================================================================
// Token Resolution
// =============================================================================

/**
 * Resolve token identifier to address.
 *
 * Accepts either a token address (0x...) or a symbol (AlphaUSD).
 * Looks up symbols in the configured token aliases.
 *
 * @param tokenInput - Token address or symbol
 * @returns Resolved token address
 * @throws ValidationError if token not found
 */
function resolveTokenAddress(tokenInput: string): Address {
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

// =============================================================================
// Balance Service Class
// =============================================================================

/**
 * Service for querying token balances and account information.
 *
 * Provides read-only operations using the public client.
 * Does not require a wallet private key.
 *
 * @example
 * ```typescript
 * const service = getBalanceService();
 *
 * // Get single balance
 * const balance = await service.getBalance('AlphaUSD');
 *
 * // Get multiple balances
 * const balances = await service.getBalances(['AlphaUSD', 'USDC']);
 *
 * // Get account info
 * const info = await service.getAccountInfo();
 * ```
 */
export class BalanceService {
  /**
   * Get the default address (configured wallet).
   *
   * @returns The configured wallet address
   * @throws Error if wallet is not configured
   */
  getDefaultAddress(): Address {
    const client = getTempoClient();
    return client.getAddress();
  }

  /**
   * Check if a wallet address is configured.
   *
   * @returns True if wallet is configured
   */
  hasWalletConfigured(): boolean {
    try {
      this.getDefaultAddress();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the balance of a single token.
   *
   * @param tokenInput - Token address or symbol
   * @param address - Address to check (defaults to configured wallet)
   * @returns Token balance information
   */
  async getBalance(tokenInput: string, address?: Address): Promise<TokenBalance> {
    const ownerAddress = address ?? this.getDefaultAddress();
    const tokenAddress = resolveTokenAddress(tokenInput);
    const client = getTempoClient();

    // Fetch token info and balance in parallel for efficiency
    const publicClient = client['publicClient'];

    const [balanceRaw, decimals, symbol, name] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'balanceOf',
        args: [ownerAddress],
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TIP20_ABI,
        functionName: 'name',
      }),
    ]);

    const balance = formatUnits(balanceRaw as bigint, decimals as number);

    return {
      token: tokenAddress,
      tokenSymbol: symbol as string,
      tokenName: name as string,
      balance,
      balanceRaw: (balanceRaw as bigint).toString(),
      decimals: decimals as number,
    };
  }

  /**
   * Get balances for multiple tokens.
   *
   * @param tokens - Array of token addresses or symbols
   * @param address - Address to check (defaults to configured wallet)
   * @returns Array of token balances
   */
  async getBalances(tokens: string[], address?: Address): Promise<TokenBalance[]> {
    const ownerAddress = address ?? this.getDefaultAddress();

    // Fetch all balances in parallel
    const balances = await Promise.all(
      tokens.map((token) => this.getBalance(token, ownerAddress))
    );

    return balances;
  }

  /**
   * Get comprehensive account information.
   *
   * @param address - Address to query (defaults to configured wallet)
   * @returns Account information including type, balances, and transaction count
   */
  async getAccountInfo(address?: Address): Promise<AccountInfo> {
    const targetAddress = address ?? this.getDefaultAddress();
    const config = getConfig();
    const client = getTempoClient();
    const publicClient = client['publicClient'];

    // Check if contract by looking for code
    const code = await publicClient.getCode({ address: targetAddress });
    const isContract = code !== undefined && code !== '0x';

    // Get transaction count
    const txCount = await publicClient.getTransactionCount({
      address: targetAddress,
    });

    // Get balances for all known tokens
    const knownTokenSymbols = Object.keys(config.tokens.aliases);
    const balances = await this.getBalances(knownTokenSymbols, targetAddress);

    // Filter out zero balances for cleaner output
    const nonZeroBalances = balances
      .filter((b) => b.balance !== '0' && b.balanceRaw !== '0')
      .map((b) => ({
        token: b.token,
        tokenSymbol: b.tokenSymbol,
        balance: b.balance,
      }));

    return {
      address: targetAddress,
      type: isContract ? 'contract' : 'eoa',
      balances: nonZeroBalances,
      transactionCount: txCount,
      // These would require an indexer to populate
      firstSeen: null,
      lastActive: null,
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: BalanceService | null = null;

/**
 * Get or create the singleton BalanceService instance.
 *
 * @returns The shared BalanceService instance
 */
export function getBalanceService(): BalanceService {
  if (!serviceInstance) {
    serviceInstance = new BalanceService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetBalanceService(): void {
  serviceInstance = null;
}

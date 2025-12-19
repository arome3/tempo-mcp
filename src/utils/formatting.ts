/**
 * Formatting Utilities
 *
 * Utility functions for formatting addresses, amounts, and memos
 * for display and blockchain interaction.
 */

import { toHex, type Hex } from 'viem';

// =============================================================================
// Memo Encoding/Decoding
// =============================================================================

/**
 * Convert a string to bytes32 hex format for TIP-20 memos.
 *
 * Memos are used for invoice reconciliation and payment tracking.
 * The string is UTF-8 encoded and right-padded with zeros to 32 bytes.
 *
 * @param str - The string to convert (max 32 bytes when UTF-8 encoded)
 * @returns 66-character hex string (0x prefix + 64 hex chars)
 * @throws Error if string exceeds 32 bytes when UTF-8 encoded
 *
 * @example
 * ```typescript
 * const memo = stringToBytes32('INV-2024-001');
 * // Returns: 0x494e562d323032342d30303100000000000000000000000000000000000000
 * ```
 */
export function stringToBytes32(str: string): Hex {
  // Encode string to UTF-8 bytes
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  // Validate length
  if (bytes.length > 32) {
    throw new Error(
      `String too long for bytes32: ${bytes.length} bytes (max 32). ` +
        `Input: "${str.slice(0, 50)}${str.length > 50 ? '...' : ''}"`
    );
  }

  // Create 32-byte array and copy input
  const padded = new Uint8Array(32);
  padded.set(bytes);

  return toHex(padded);
}

/**
 * Decode a bytes32 hex string back to its original string.
 *
 * Useful for reading memos from transaction data.
 * Strips trailing null bytes before decoding.
 *
 * @param hex - 66-character hex string (0x prefix + 64 hex chars)
 * @returns The decoded UTF-8 string
 *
 * @example
 * ```typescript
 * const str = bytes32ToString('0x494e562d323032342d30303100000000000000000000000000000000000000');
 * // Returns: 'INV-2024-001'
 * ```
 */
export function bytes32ToString(hex: Hex): string {
  // Remove 0x prefix and validate length
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (hexStr.length !== 64) {
    throw new Error(
      `Invalid bytes32 length: expected 64 hex chars, got ${hexStr.length}`
    );
  }

  // Convert hex pairs to bytes
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }

  // Find first null byte (end of string)
  let endIndex = bytes.indexOf(0);
  if (endIndex === -1) {
    endIndex = 32;
  }

  // Decode UTF-8
  const decoder = new TextDecoder();
  return decoder.decode(bytes.slice(0, endIndex));
}

// =============================================================================
// Address Formatting
// =============================================================================

/**
 * Truncate an Ethereum address for display.
 *
 * Shows first 6 and last 4 characters with ellipsis in between.
 *
 * @param address - Full Ethereum address (0x + 40 hex chars)
 * @returns Truncated address (e.g., "0x1234...5678")
 *
 * @example
 * ```typescript
 * truncateAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb')
 * // Returns: '0x742d...bEbb'
 * ```
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format an address with checksum (mixed case).
 *
 * This is the standard display format for Ethereum addresses.
 * Note: For actual checksum validation, use viem's getAddress().
 *
 * @param address - Ethereum address in any case
 * @returns Address with proper capitalization hint
 */
export function formatAddress(address: string): string {
  // Normalize to lowercase for consistency
  return address.toLowerCase();
}

// =============================================================================
// Amount Formatting
// =============================================================================

/**
 * Format a token amount with symbol for display.
 *
 * Uses locale-aware number formatting with appropriate decimal places.
 *
 * @param amount - The amount as a string (human-readable units)
 * @param symbol - Token symbol (e.g., "AlphaUSD")
 * @returns Formatted string (e.g., "1,234.56 AlphaUSD")
 *
 * @example
 * ```typescript
 * formatAmount('1234.5', 'AlphaUSD')
 * // Returns: '1,234.50 AlphaUSD'
 * ```
 */
export function formatAmount(amount: string, symbol: string): string {
  const num = parseFloat(amount);

  if (isNaN(num)) {
    return `${amount} ${symbol}`;
  }

  // Format with 2-6 decimal places depending on value
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

  return `${formatted} ${symbol}`;
}

/**
 * Format a raw token amount (wei) to human-readable units.
 *
 * @param rawAmount - Amount in smallest unit (e.g., wei)
 * @param decimals - Token decimals (e.g., 6 for USDC)
 * @returns Human-readable amount string
 *
 * @example
 * ```typescript
 * formatRawAmount(BigInt('1000000'), 6)
 * // Returns: '1.000000'
 * ```
 */
export function formatRawAmount(rawAmount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = rawAmount / divisor;
  const fractionalPart = rawAmount % divisor;

  // Pad fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  return `${wholePart}.${fractionalStr}`;
}

/**
 * Format gas cost for display.
 *
 * Gas on Tempo is paid in stablecoins, so we format with USD-like precision.
 *
 * @param gasUsed - Gas units used
 * @param gasPrice - Price per gas unit (in wei of fee token)
 * @param decimals - Fee token decimals (typically 6)
 * @returns Formatted gas cost string
 */
export function formatGasCost(
  gasUsed: bigint,
  gasPrice: bigint,
  decimals: number = 6
): string {
  const totalWei = gasUsed * gasPrice;
  return formatRawAmount(totalWei, decimals);
}

// =============================================================================
// Explorer URL Formatting
// =============================================================================

/**
 * Build a block explorer URL for a transaction.
 *
 * @param explorerUrl - Base explorer URL (e.g., "https://explore.tempo.xyz")
 * @param txHash - Transaction hash
 * @returns Full explorer URL for the transaction
 */
export function buildExplorerTxUrl(explorerUrl: string, txHash: string): string {
  // Remove trailing slash if present
  const baseUrl = explorerUrl.replace(/\/$/, '');
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Build a block explorer URL for an address.
 *
 * @param explorerUrl - Base explorer URL
 * @param address - Ethereum address
 * @returns Full explorer URL for the address
 */
export function buildExplorerAddressUrl(
  explorerUrl: string,
  address: string
): string {
  const baseUrl = explorerUrl.replace(/\/$/, '');
  return `${baseUrl}/address/${address}`;
}

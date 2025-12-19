/**
 * Formatting Utilities Unit Tests
 *
 * Comprehensive tests for string/bytes32 encoding, address/amount formatting,
 * and explorer URL building functions.
 */

import { describe, it, expect } from 'vitest';
import {
  stringToBytes32,
  bytes32ToString,
  truncateAddress,
  formatAddress,
  formatAmount,
  formatRawAmount,
  formatGasCost,
  buildExplorerTxUrl,
  buildExplorerAddressUrl,
} from '../../../src/utils/formatting.js';
import { TEST_ADDRESSES, TEST_TX_HASHES } from '../../utils/test-helpers.js';

// =============================================================================
// Memo Encoding/Decoding Tests
// =============================================================================

describe('stringToBytes32', () => {
  it('should convert simple ASCII string', () => {
    const result = stringToBytes32('hello');
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    // 'hello' = 68 65 6c 6c 6f in hex, padded with zeros
    expect(result.slice(2, 12)).toBe('68656c6c6f'); // 'hello' in hex
    // Rest should be zeros
    expect(result.slice(12)).toBe('0'.repeat(54));
  });

  it('should handle empty string', () => {
    const result = stringToBytes32('');
    expect(result).toBe('0x' + '0'.repeat(64));
  });

  it('should handle string exactly 32 bytes', () => {
    const str = 'a'.repeat(32);
    const result = stringToBytes32(str);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    // All bytes should be 0x61 ('a' in ASCII)
    expect(result.slice(2)).toBe('61'.repeat(32));
  });

  it('should handle invoice ID format', () => {
    const invoiceId = 'INV-2024-001';
    const result = stringToBytes32(invoiceId);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    // Should be able to decode back
    expect(bytes32ToString(result)).toBe(invoiceId);
  });

  it('should handle UTF-8 multi-byte characters', () => {
    // Each emoji is 4 bytes, so 8 emojis = 32 bytes (max)
    const emojis = '🎉'.repeat(8);
    const result = stringToBytes32(emojis);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('should throw for string exceeding 32 bytes', () => {
    const tooLong = 'a'.repeat(33);
    expect(() => stringToBytes32(tooLong)).toThrow('String too long for bytes32');
  });

  it('should throw for UTF-8 string exceeding 32 bytes', () => {
    // 9 emojis = 36 bytes
    const tooLong = '🎉'.repeat(9);
    expect(() => stringToBytes32(tooLong)).toThrow('String too long for bytes32');
  });

  it('should include input preview in error message', () => {
    const tooLong = 'a'.repeat(50);
    expect(() => stringToBytes32(tooLong)).toThrow(/Input: "a{50}/);
  });

  it('should truncate long input in error message', () => {
    const veryLong = 'x'.repeat(100);
    try {
      stringToBytes32(veryLong);
      expect.fail('Should have thrown');
    } catch (e) {
      const error = e as Error;
      expect(error.message).toContain('...');
      expect(error.message).not.toContain('x'.repeat(100));
    }
  });

  it('should handle mixed ASCII and UTF-8', () => {
    // 'Hi ' = 3 bytes, + 7 emojis = 28 bytes = 31 bytes total (valid)
    const mixed = 'Hi ' + '🎉'.repeat(7);
    const result = stringToBytes32(mixed);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('should preserve special characters', () => {
    const special = 'Test@#$%^&*()!';
    const result = stringToBytes32(special);
    expect(bytes32ToString(result)).toBe(special);
  });
});

describe('bytes32ToString', () => {
  it('should decode simple ASCII string', () => {
    // 'hello' followed by zeros
    const hex = '0x68656c6c6f' + '0'.repeat(54);
    const result = bytes32ToString(hex as `0x${string}`);
    expect(result).toBe('hello');
  });

  it('should decode empty bytes32 to empty string', () => {
    const hex = '0x' + '0'.repeat(64);
    const result = bytes32ToString(hex as `0x${string}`);
    expect(result).toBe('');
  });

  it('should decode full 32-byte string', () => {
    const hex = '0x' + '61'.repeat(32); // 32 'a' characters
    const result = bytes32ToString(hex as `0x${string}`);
    expect(result).toBe('a'.repeat(32));
  });

  it('should strip trailing null bytes', () => {
    // 'test' + zeros
    const hex = '0x74657374' + '0'.repeat(56);
    const result = bytes32ToString(hex as `0x${string}`);
    expect(result).toBe('test');
  });

  it('should handle hex without 0x prefix', () => {
    const hex = '74657374' + '0'.repeat(56);
    // Note: TypeScript type says Hex but implementation handles both
    const result = bytes32ToString(hex as `0x${string}`);
    expect(result).toBe('test');
  });

  it('should throw for invalid length (too short)', () => {
    expect(() => bytes32ToString('0x1234' as `0x${string}`)).toThrow(
      'Invalid bytes32 length'
    );
  });

  it('should throw for invalid length (too long)', () => {
    const tooLong = '0x' + 'a'.repeat(66);
    expect(() => bytes32ToString(tooLong as `0x${string}`)).toThrow(
      'Invalid bytes32 length'
    );
  });

  it('should roundtrip with stringToBytes32', () => {
    const testStrings = [
      'hello',
      'INV-2024-001',
      'Payment for services',
      '',
      'a'.repeat(32),
      '!@#$%^&*()',
    ];

    for (const str of testStrings) {
      const encoded = stringToBytes32(str);
      const decoded = bytes32ToString(encoded);
      expect(decoded).toBe(str);
    }
  });

  it('should handle UTF-8 roundtrip', () => {
    const utf8Strings = ['Café', 'München', '日本語', '🎉🎊'];

    for (const str of utf8Strings) {
      const encoded = stringToBytes32(str);
      const decoded = bytes32ToString(encoded);
      expect(decoded).toBe(str);
    }
  });

  it('should handle uppercase hex characters', () => {
    const hex = '0x' + '41'.repeat(32); // 32 'A' characters in uppercase hex
    // Note: hex must keep 0x lowercase, but hex chars can be uppercase
    const result = bytes32ToString(('0x' + hex.slice(2).toUpperCase()) as `0x${string}`);
    expect(result).toBe('A'.repeat(32));
  });
});

// =============================================================================
// Address Formatting Tests
// =============================================================================

describe('truncateAddress', () => {
  it('should truncate standard address', () => {
    const result = truncateAddress(TEST_ADDRESSES.VALID);
    expect(result).toMatch(/^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/);
    expect(result.length).toBe(13); // 0x + 4 + ... + 4
  });

  it('should show first 6 and last 4 characters', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const result = truncateAddress(address);
    expect(result).toBe('0x1234...5678');
  });

  it('should return short strings unchanged', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234');
    expect(truncateAddress('0x12345')).toBe('0x12345');
    expect(truncateAddress('0x123456')).toBe('0x123456');
  });

  it('should handle exactly 10 characters', () => {
    const result = truncateAddress('0x12345678');
    // Length is 10, which is not < 10, so it should truncate
    expect(result).toBe('0x1234...5678');
  });

  it('should return empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });

  it('should handle null/undefined gracefully', () => {
    expect(truncateAddress(null as unknown as string)).toBeFalsy();
    expect(truncateAddress(undefined as unknown as string)).toBeFalsy();
  });

  it('should handle lowercase addresses', () => {
    const lowercase = TEST_ADDRESSES.LOWERCASE;
    const result = truncateAddress(lowercase);
    expect(result).toMatch(/^0x[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
  });
});

describe('formatAddress', () => {
  it('should normalize to lowercase', () => {
    const mixed = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';
    const result = formatAddress(mixed);
    expect(result).toBe(mixed.toLowerCase());
  });

  it('should handle already lowercase', () => {
    const lowercase = TEST_ADDRESSES.LOWERCASE;
    const result = formatAddress(lowercase);
    expect(result).toBe(lowercase);
  });

  it('should handle uppercase', () => {
    const uppercase = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
    const result = formatAddress(uppercase);
    expect(result).toBe(uppercase.toLowerCase());
  });
});

// =============================================================================
// Amount Formatting Tests
// =============================================================================

describe('formatAmount', () => {
  it('should format integer amounts with symbol', () => {
    const result = formatAmount('1000', 'AlphaUSD');
    expect(result).toBe('1,000.00 AlphaUSD');
  });

  it('should format decimal amounts', () => {
    const result = formatAmount('1234.56', 'USDC');
    expect(result).toBe('1,234.56 USDC');
  });

  it('should format small decimal amounts', () => {
    const result = formatAmount('0.000001', 'ETH');
    // Should show up to 6 decimal places
    expect(result).toBe('0.000001 ETH');
  });

  it('should format large amounts with thousands separators', () => {
    const result = formatAmount('1234567.89', 'AlphaUSD');
    expect(result).toBe('1,234,567.89 AlphaUSD');
  });

  it('should handle zero', () => {
    const result = formatAmount('0', 'USDC');
    expect(result).toBe('0.00 USDC');
  });

  it('should handle NaN input gracefully', () => {
    const result = formatAmount('not-a-number', 'TOKEN');
    expect(result).toBe('not-a-number TOKEN');
  });

  it('should handle empty string', () => {
    const result = formatAmount('', 'TOKEN');
    expect(result).toBe(' TOKEN');
  });

  it('should maintain minimum 2 decimal places', () => {
    const result = formatAmount('100', 'USDC');
    expect(result).toContain('.00');
  });

  it('should cap at 6 decimal places', () => {
    const result = formatAmount('1.123456789', 'TOKEN');
    // Should only show 6 decimals max
    expect(result).toBe('1.123457 TOKEN'); // Rounded
  });
});

describe('formatRawAmount', () => {
  it('should convert wei to human readable (6 decimals)', () => {
    const result = formatRawAmount(BigInt('1000000'), 6);
    expect(result).toBe('1.000000');
  });

  it('should handle small amounts', () => {
    const result = formatRawAmount(BigInt('1'), 6);
    expect(result).toBe('0.000001');
  });

  it('should handle large amounts', () => {
    const result = formatRawAmount(BigInt('1234567890000'), 6);
    expect(result).toBe('1234567.890000');
  });

  it('should handle zero', () => {
    const result = formatRawAmount(BigInt('0'), 6);
    expect(result).toBe('0.000000');
  });

  it('should handle 18 decimals (ETH standard)', () => {
    const oneEth = BigInt('1000000000000000000');
    const result = formatRawAmount(oneEth, 18);
    expect(result).toBe('1.000000000000000000');
  });

  it('should handle fractional ETH', () => {
    const halfEth = BigInt('500000000000000000');
    const result = formatRawAmount(halfEth, 18);
    expect(result).toBe('0.500000000000000000');
  });

  it('should pad fractional part with leading zeros', () => {
    // 500 units with 6 decimals = 0.000500
    const result = formatRawAmount(BigInt('500'), 6);
    expect(result).toBe('0.000500');
  });

  it('should handle 0 decimals', () => {
    const result = formatRawAmount(BigInt('12345'), 0);
    // With 0 decimals, padStart(0, '0') on '0' still returns '0'
    expect(result).toBe('12345.0');
  });

  it('should handle 1 decimal', () => {
    const result = formatRawAmount(BigInt('12345'), 1);
    expect(result).toBe('1234.5');
  });
});

describe('formatGasCost', () => {
  it('should calculate and format gas cost', () => {
    const gasUsed = BigInt('21000');
    const gasPrice = BigInt('1000000'); // 1 USDC per gas unit
    const result = formatGasCost(gasUsed, gasPrice, 6);
    // 21000 * 1000000 = 21000000000 = 21000.000000
    expect(result).toBe('21000.000000');
  });

  it('should handle small gas costs', () => {
    const gasUsed = BigInt('100');
    const gasPrice = BigInt('100'); // 0.0001 per gas
    const result = formatGasCost(gasUsed, gasPrice, 6);
    // 100 * 100 = 10000 = 0.010000
    expect(result).toBe('0.010000');
  });

  it('should use default 6 decimals', () => {
    const gasUsed = BigInt('1000');
    const gasPrice = BigInt('1000');
    const result = formatGasCost(gasUsed, gasPrice);
    expect(result).toBe('1.000000');
  });

  it('should handle zero gas', () => {
    const result = formatGasCost(BigInt('0'), BigInt('1000000'), 6);
    expect(result).toBe('0.000000');
  });

  it('should handle zero gas price', () => {
    const result = formatGasCost(BigInt('21000'), BigInt('0'), 6);
    expect(result).toBe('0.000000');
  });
});

// =============================================================================
// Explorer URL Tests
// =============================================================================

describe('buildExplorerTxUrl', () => {
  it('should build valid transaction URL', () => {
    const result = buildExplorerTxUrl(
      'https://explore.tempo.xyz',
      TEST_TX_HASHES.VALID
    );
    expect(result).toBe(`https://explore.tempo.xyz/tx/${TEST_TX_HASHES.VALID}`);
  });

  it('should handle URL with trailing slash', () => {
    const result = buildExplorerTxUrl(
      'https://explore.tempo.xyz/',
      '0xabc123'
    );
    expect(result).toBe('https://explore.tempo.xyz/tx/0xabc123');
  });

  it('should handle URL without trailing slash', () => {
    const result = buildExplorerTxUrl(
      'https://explore.tempo.xyz',
      '0xabc123'
    );
    expect(result).toBe('https://explore.tempo.xyz/tx/0xabc123');
  });

  it('should handle different explorer URLs', () => {
    const result = buildExplorerTxUrl(
      'https://etherscan.io',
      '0xabc'
    );
    expect(result).toBe('https://etherscan.io/tx/0xabc');
  });

  it('should handle multiple trailing slashes', () => {
    const result = buildExplorerTxUrl(
      'https://explore.tempo.xyz//',
      '0xabc'
    );
    // Only removes one trailing slash
    expect(result).toBe('https://explore.tempo.xyz//tx/0xabc');
  });

  it('should handle localhost URLs', () => {
    const result = buildExplorerTxUrl(
      'http://localhost:3000',
      '0xabc'
    );
    expect(result).toBe('http://localhost:3000/tx/0xabc');
  });
});

describe('buildExplorerAddressUrl', () => {
  it('should build valid address URL', () => {
    const result = buildExplorerAddressUrl(
      'https://explore.tempo.xyz',
      TEST_ADDRESSES.VALID
    );
    expect(result).toBe(`https://explore.tempo.xyz/address/${TEST_ADDRESSES.VALID}`);
  });

  it('should handle URL with trailing slash', () => {
    const result = buildExplorerAddressUrl(
      'https://explore.tempo.xyz/',
      TEST_ADDRESSES.VALID
    );
    expect(result).toBe(`https://explore.tempo.xyz/address/${TEST_ADDRESSES.VALID}`);
  });

  it('should handle zero address', () => {
    const result = buildExplorerAddressUrl(
      'https://explore.tempo.xyz',
      TEST_ADDRESSES.ZERO
    );
    expect(result).toBe(`https://explore.tempo.xyz/address/${TEST_ADDRESSES.ZERO}`);
  });

  it('should handle different explorer URLs', () => {
    const result = buildExplorerAddressUrl(
      'https://basescan.org',
      TEST_ADDRESSES.VALID
    );
    expect(result).toContain('basescan.org/address/');
  });
});

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe('edge cases', () => {
  it('should handle bytes32 with embedded nulls', () => {
    // Create a string with embedded null (though unusual)
    const hex = '0x' + '61006100' + '0'.repeat(56); // 'a\0a' + padding
    const result = bytes32ToString(hex as `0x${string}`);
    // Should stop at first null
    expect(result).toBe('a');
  });

  it('should handle very small raw amounts', () => {
    // 1 wei with 18 decimals
    const result = formatRawAmount(BigInt('1'), 18);
    expect(result).toBe('0.000000000000000001');
  });

  it('should handle maximum safe integer as raw amount', () => {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const result = formatRawAmount(maxSafe, 6);
    expect(result).toMatch(/^\d+\.\d{6}$/);
  });

  it('should handle amounts larger than MAX_SAFE_INTEGER', () => {
    // BigInt can handle arbitrarily large numbers
    const veryLarge = BigInt('12345678901234567890123456789');
    const result = formatRawAmount(veryLarge, 6);
    expect(result).toMatch(/^\d+\.\d{6}$/);
  });
});

describe('integration scenarios', () => {
  it('should format payment display correctly', () => {
    // Simulate displaying a payment
    const rawAmount = BigInt('1500000'); // 1.5 USDC (6 decimals)
    const humanReadable = formatRawAmount(rawAmount, 6);
    const formatted = formatAmount(humanReadable, 'USDC');
    const truncatedAddr = truncateAddress(TEST_ADDRESSES.VALID);
    const explorerUrl = buildExplorerTxUrl('https://explore.tempo.xyz', TEST_TX_HASHES.VALID);

    expect(humanReadable).toBe('1.500000');
    expect(formatted).toContain('1.5');
    expect(formatted).toContain('USDC');
    expect(truncatedAddr).toMatch(/0x\w{4}\.\.\.\w{4}/);
    expect(explorerUrl).toContain('/tx/');
  });

  it('should handle memo roundtrip in payment context', () => {
    const invoiceMemo = 'INV-2024-0042';
    const encoded = stringToBytes32(invoiceMemo);
    const decoded = bytes32ToString(encoded);

    expect(encoded).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decoded).toBe(invoiceMemo);
  });

  it('should format gas cost in payment context', () => {
    // Typical gas values
    const gasUsed = BigInt('65000');
    const gasPrice = BigInt('1000'); // 0.001 per gas in 6 decimal token
    const cost = formatGasCost(gasUsed, gasPrice, 6);
    const formattedCost = formatAmount(cost, 'USDC');

    expect(formattedCost).toContain('USDC');
  });
});

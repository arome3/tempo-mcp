/**
 * Address Allowlist Manager Unit Tests
 *
 * Comprehensive tests for the AddressAllowlistManager class,
 * covering allowlist/blocklist modes, config caching, and DoS prevention.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AddressAllowlistManager,
  getAddressAllowlistManager,
  resetAddressAllowlistManager,
} from '../../../src/security/address-allowlist.js';
import { SecurityError } from '../../../src/utils/errors.js';
import {
  setMockConfig,
  resetMockConfig,
  createAllowlistConfig,
  createMockConfig,
} from '../../utils/mock-config.js';
import { TEST_ADDRESSES } from '../../utils/test-helpers.js';

// =============================================================================
// Mock Configuration Module
// =============================================================================

vi.mock('../../../src/config/index.js', async () => {
  const { getMockConfig } = await import('../../utils/mock-config.js');
  return {
    getConfig: () => getMockConfig(),
    loadConfig: () => getMockConfig(),
    resetConfig: vi.fn(),
  };
});

// =============================================================================
// Test Suite
// =============================================================================

describe('AddressAllowlistManager', () => {
  let manager: AddressAllowlistManager;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAddressAllowlistManager();
    resetMockConfig();
    manager = new AddressAllowlistManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMockConfig();
  });

  // ===========================================================================
  // Disabled Mode
  // ===========================================================================

  describe('disabled mode', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: false,
      }));
      manager = new AddressAllowlistManager();
    });

    it('should allow all addresses when disabled', () => {
      const result = manager.check(TEST_ADDRESSES.VALID);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow unknown addresses when disabled', () => {
      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(true);
    });

    it('should allow zero address when disabled', () => {
      const result = manager.check(TEST_ADDRESSES.ZERO);

      expect(result.allowed).toBe(true);
    });

    it('should report not enabled via isEnabled()', () => {
      expect(manager.isEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // Allowlist Mode
  // ===========================================================================

  describe('allowlist mode', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
        labels: {
          [TEST_ADDRESSES.VALID]: 'Recipient One',
          [TEST_ADDRESSES.VALID_2]: 'Recipient Two',
        },
      }));
      manager = new AddressAllowlistManager();
    });

    it('should allow addresses in allowlist', () => {
      const result = manager.check(TEST_ADDRESSES.VALID);

      expect(result.allowed).toBe(true);
    });

    it('should reject addresses not in allowlist', () => {
      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Address not in allowlist');
    });

    it('should return label for known addresses', () => {
      const result = manager.check(TEST_ADDRESSES.VALID);

      expect(result.label).toBe('Recipient One');
    });

    it('should not return label for allowed but unlabeled addresses', () => {
      // Set config with an address but no label
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID_3],
        labels: {}, // No label for VALID_3
      }));
      manager = new AddressAllowlistManager();

      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(true);
      expect(result.label).toBeUndefined();
    });

    it('should report allowlist mode via getMode()', () => {
      expect(manager.getMode()).toBe('allowlist');
    });

    it('should throw via validate() for unlisted addresses', () => {
      expect(() => manager.validate(TEST_ADDRESSES.VALID_3)).toThrow(
        SecurityError
      );
    });

    it('should not throw via validate() for listed addresses', () => {
      expect(() => manager.validate(TEST_ADDRESSES.VALID)).not.toThrow();
    });
  });

  // ===========================================================================
  // Blocklist Mode
  // ===========================================================================

  describe('blocklist mode', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'blocklist',
        addresses: [TEST_ADDRESSES.VALID_3],
        labels: {
          [TEST_ADDRESSES.VALID_3]: 'Blocked Account',
        },
      }));
      manager = new AddressAllowlistManager();
    });

    it('should block addresses in blocklist', () => {
      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(false);
    });

    it('should allow addresses not in blocklist', () => {
      const result = manager.check(TEST_ADDRESSES.VALID);

      expect(result.allowed).toBe(true);
    });

    it('should include label in rejection reason', () => {
      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked Account');
      expect(result.label).toBe('Blocked Account');
    });

    it('should show generic message for blocked address without label', () => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'blocklist',
        addresses: [TEST_ADDRESSES.VALID_3],
        labels: {}, // No label
      }));
      manager = new AddressAllowlistManager();

      const result = manager.check(TEST_ADDRESSES.VALID_3);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Address is blocked');
    });

    it('should report blocklist mode via getMode()', () => {
      expect(manager.getMode()).toBe('blocklist');
    });
  });

  // ===========================================================================
  // Case Normalization
  // ===========================================================================

  describe('case normalization', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID.toLowerCase()],
      }));
      manager = new AddressAllowlistManager();
    });

    it('should match addresses regardless of case', () => {
      // Query with uppercase
      const result = manager.check(TEST_ADDRESSES.VALID.toUpperCase());

      expect(result.allowed).toBe(true);
    });

    it('should normalize addresses to lowercase internally', () => {
      const addresses = manager.getAddresses();

      expect(addresses[0].address).toBe(TEST_ADDRESSES.VALID.toLowerCase());
    });

    it('should match mixed case addresses', () => {
      const mixedCase =
        '0x742D35Cc6634c0532925a3b844Bc9E7595f0BEbb'.toLowerCase();

      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [mixedCase],
      }));
      manager = new AddressAllowlistManager();

      const result = manager.check(mixedCase.toUpperCase());

      expect(result.allowed).toBe(true);
    });
  });

  // ===========================================================================
  // Config Caching (DoS Prevention)
  // ===========================================================================

  describe('config caching - DoS prevention', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00'));
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
      }));
      manager = new AddressAllowlistManager();
    });

    it('should cache config for CONFIG_CHECK_INTERVAL_MS', () => {
      // First check loads config
      manager.check(TEST_ADDRESSES.VALID);

      // Change the mock config
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID_2], // Different address
      }));

      // Advance 2 seconds (less than 5s interval)
      vi.setSystemTime(new Date('2024-12-15T12:00:02'));

      // Should still use cached config
      const result = manager.check(TEST_ADDRESSES.VALID);
      expect(result.allowed).toBe(true);
    });

    it('should reload config after interval expires', () => {
      // First check loads config
      manager.check(TEST_ADDRESSES.VALID);
      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(true);

      // Change the mock config
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID_2], // Remove VALID, add VALID_2
      }));

      // Advance 6 seconds (more than 5s interval)
      vi.setSystemTime(new Date('2024-12-15T12:00:06'));

      // Should reload and use new config
      const result = manager.check(TEST_ADDRESSES.VALID);
      expect(result.allowed).toBe(false); // VALID is no longer in allowlist
    });

    it('should only reload when config hash changes', () => {
      // First check
      manager.check(TEST_ADDRESSES.VALID);

      // Advance past interval
      vi.setSystemTime(new Date('2024-12-15T12:00:06'));

      // Config unchanged, just accessed again
      const result = manager.check(TEST_ADDRESSES.VALID);
      expect(result.allowed).toBe(true);
    });

    it('should detect config changes via hash comparison', () => {
      // First check
      manager.check(TEST_ADDRESSES.VALID);

      // Change only the labels (config content changed)
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
        labels: { [TEST_ADDRESSES.VALID]: 'New Label' },
      }));

      // Advance past interval
      vi.setSystemTime(new Date('2024-12-15T12:00:06'));

      // Should detect label change
      const result = manager.check(TEST_ADDRESSES.VALID);
      expect(result.label).toBe('New Label');
    });
  });

  // ===========================================================================
  // reload() Method
  // ===========================================================================

  describe('reload', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
      }));
      manager = new AddressAllowlistManager();
    });

    it('should force reload from config', () => {
      // Initial state
      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(true);

      // Change config
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID_2],
      }));

      // Force reload (bypasses cache interval)
      manager.reload();

      // Should use new config immediately
      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(false);
      expect(manager.check(TEST_ADDRESSES.VALID_2).allowed).toBe(true);
    });

    it('should update addressSet correctly', () => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2, TEST_ADDRESSES.VALID_3],
      }));

      manager.reload();

      const addresses = manager.getAddresses();
      expect(addresses.length).toBe(3);
    });

    it('should update labels correctly', () => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
        labels: { [TEST_ADDRESSES.VALID]: 'Updated Label' },
      }));

      manager.reload();

      expect(manager.getLabel(TEST_ADDRESSES.VALID)).toBe('Updated Label');
    });
  });

  // ===========================================================================
  // getAddresses() Method
  // ===========================================================================

  describe('getAddresses', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
        labels: {
          [TEST_ADDRESSES.VALID]: 'Address One',
        },
      }));
      manager = new AddressAllowlistManager();
    });

    it('should return all configured addresses', () => {
      const addresses = manager.getAddresses();

      expect(addresses.length).toBe(2);
    });

    it('should include labels where configured', () => {
      const addresses = manager.getAddresses();
      const addr1 = addresses.find(
        (a) => a.address === TEST_ADDRESSES.VALID.toLowerCase()
      );
      const addr2 = addresses.find(
        (a) => a.address === TEST_ADDRESSES.VALID_2.toLowerCase()
      );

      expect(addr1?.label).toBe('Address One');
      expect(addr2?.label).toBeUndefined();
    });
  });

  // ===========================================================================
  // isInList() Method
  // ===========================================================================

  describe('isInList', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
      }));
      manager = new AddressAllowlistManager();
    });

    it('should return true for addresses in list', () => {
      expect(manager.isInList(TEST_ADDRESSES.VALID)).toBe(true);
    });

    it('should return false for addresses not in list', () => {
      expect(manager.isInList(TEST_ADDRESSES.VALID_2)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(manager.isInList(TEST_ADDRESSES.VALID.toUpperCase())).toBe(true);
    });
  });

  // ===========================================================================
  // getLabel() Method
  // ===========================================================================

  describe('getLabel', () => {
    beforeEach(() => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID, TEST_ADDRESSES.VALID_2],
        labels: {
          [TEST_ADDRESSES.VALID]: 'Labeled Address',
        },
      }));
      manager = new AddressAllowlistManager();
    });

    it('should return label for labeled addresses', () => {
      expect(manager.getLabel(TEST_ADDRESSES.VALID)).toBe('Labeled Address');
    });

    it('should return undefined for unlabeled addresses', () => {
      expect(manager.getLabel(TEST_ADDRESSES.VALID_2)).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      expect(manager.getLabel(TEST_ADDRESSES.VALID.toUpperCase())).toBe(
        'Labeled Address'
      );
    });
  });

  // ===========================================================================
  // Singleton Management
  // ===========================================================================

  describe('singleton management', () => {
    beforeEach(() => {
      resetAddressAllowlistManager();
      setMockConfig(createAllowlistConfig());
    });

    it('getAddressAllowlistManager should return same instance', () => {
      const instance1 = getAddressAllowlistManager();
      const instance2 = getAddressAllowlistManager();

      expect(instance1).toBe(instance2);
    });

    it('resetAddressAllowlistManager should clear singleton', () => {
      const instance1 = getAddressAllowlistManager();

      resetAddressAllowlistManager();

      const instance2 = getAddressAllowlistManager();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle empty address list in allowlist mode', () => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [], // Empty list
      }));
      manager = new AddressAllowlistManager();

      // All addresses should be rejected
      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(false);
    });

    it('should handle empty address list in blocklist mode', () => {
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'blocklist',
        addresses: [], // Empty list
      }));
      manager = new AddressAllowlistManager();

      // All addresses should be allowed
      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(true);
    });

    it('should handle switching between modes', () => {
      // Start with allowlist
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: [TEST_ADDRESSES.VALID],
      }));
      manager = new AddressAllowlistManager();

      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(true);
      expect(manager.check(TEST_ADDRESSES.VALID_2).allowed).toBe(false);

      // Switch to blocklist with same addresses
      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'blocklist',
        addresses: [TEST_ADDRESSES.VALID],
      }));
      manager.reload();

      expect(manager.check(TEST_ADDRESSES.VALID).allowed).toBe(false);
      expect(manager.check(TEST_ADDRESSES.VALID_2).allowed).toBe(true);
    });

    it('should handle many addresses efficiently', () => {
      const manyAddresses = Array.from({ length: 1000 }, (_, i) =>
        `0x${i.toString(16).padStart(40, '0')}`
      );

      setMockConfig(createAllowlistConfig({
        enabled: true,
        mode: 'allowlist',
        addresses: manyAddresses,
      }));
      manager = new AddressAllowlistManager();

      // Should still be fast
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        manager.check(manyAddresses[i]);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});

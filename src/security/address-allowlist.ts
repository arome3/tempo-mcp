/**
 * Address Allowlist/Blocklist Security Module
 *
 * Enforces recipient address restrictions based on configuration.
 * Supports two modes:
 * - Allowlist: Only listed addresses can receive payments
 * - Blocklist: Listed addresses are blocked from receiving payments
 */

import { getConfig } from '../config/index.js';
import { SecurityError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of address validation.
 */
export interface AddressValidationResult {
  /** Whether the address is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Label for the address (if configured) */
  label?: string;
}

// =============================================================================
// AddressAllowlistManager Class
// =============================================================================

/**
 * Manages address allowlist/blocklist validation.
 *
 * Validates recipient addresses against the configured list.
 * Can operate in allowlist mode (whitelist) or blocklist mode.
 *
 * SECURITY: Uses config caching to prevent DoS via repeated config reloads.
 */
export class AddressAllowlistManager {
  /** Normalized addresses set for fast lookup */
  private addressSet: Set<string> = new Set();

  /** Address to label mapping */
  private labels: Map<string, string> = new Map();

  /** Whether the list is enabled */
  private enabled: boolean = false;

  /** Mode: 'allowlist' or 'blocklist' */
  private mode: 'allowlist' | 'blocklist' = 'allowlist';

  /**
   * SECURITY FIX: Cache config hash to avoid reloading on every check.
   * Only reload when config actually changes.
   */
  private configHash: string = '';

  /**
   * Last time config was checked (ms since epoch).
   * Even with caching, periodically verify config hasn't changed.
   */
  private lastConfigCheck: number = 0;

  /** How often to check if config changed (5 seconds) */
  private readonly CONFIG_CHECK_INTERVAL_MS = 5000;

  constructor() {
    this.loadFromConfig();
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Validate a recipient address against the list.
   *
   * @param address - The recipient address to validate
   * @returns Validation result with allowed status and reason
   */
  check(address: string): AddressValidationResult {
    // SECURITY FIX: Only reload config if it might have changed
    this.maybeReloadConfig();

    // If not enabled, all addresses are allowed
    if (!this.enabled) {
      return { allowed: true };
    }

    const normalizedAddress = address.toLowerCase();
    const isInList = this.addressSet.has(normalizedAddress);
    const label = this.labels.get(normalizedAddress);

    if (this.mode === 'allowlist') {
      // Allowlist mode: only listed addresses are allowed
      if (isInList) {
        return {
          allowed: true,
          label,
        };
      } else {
        return {
          allowed: false,
          reason: 'Address not in allowlist',
        };
      }
    } else {
      // Blocklist mode: listed addresses are blocked
      if (isInList) {
        return {
          allowed: false,
          reason: label ? `Address is blocked (${label})` : 'Address is blocked',
          label,
        };
      } else {
        return { allowed: true };
      }
    }
  }

  /**
   * Validate a recipient address and throw if not allowed.
   *
   * @param address - The recipient address to validate
   * @throws SecurityError if address is not allowed
   */
  validate(address: string): void {
    const result = this.check(address);

    if (!result.allowed) {
      throw SecurityError.recipientNotAllowed(address);
    }
  }

  /**
   * Check if the allowlist feature is enabled.
   */
  isEnabled(): boolean {
    this.maybeReloadConfig();
    return this.enabled;
  }

  /**
   * Get the current mode.
   */
  getMode(): 'allowlist' | 'blocklist' {
    this.maybeReloadConfig();
    return this.mode;
  }

  /**
   * Get the label for an address (if configured).
   *
   * @param address - The address to look up
   * @returns Label or undefined
   */
  getLabel(address: string): string | undefined {
    this.maybeReloadConfig();
    return this.labels.get(address.toLowerCase());
  }

  /**
   * Get all configured addresses.
   *
   * @returns Array of addresses with their labels
   */
  getAddresses(): Array<{ address: string; label?: string }> {
    this.maybeReloadConfig();

    return Array.from(this.addressSet).map((address) => ({
      address,
      label: this.labels.get(address),
    }));
  }

  /**
   * Check if a specific address is in the list.
   *
   * @param address - Address to check
   * @returns True if in list
   */
  isInList(address: string): boolean {
    this.maybeReloadConfig();
    return this.addressSet.has(address.toLowerCase());
  }

  /**
   * Force reload configuration from config.
   *
   * Primarily useful for testing or dynamic config updates.
   */
  reload(): void {
    this.configHash = ''; // Force reload
    this.loadFromConfig();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if config might have changed and reload if necessary.
   *
   * SECURITY FIX: Uses time-based throttling + hash comparison to prevent
   * DoS attacks that exploit expensive config reloads.
   */
  private maybeReloadConfig(): void {
    const now = Date.now();

    // Only check config periodically (every 5 seconds)
    if (now - this.lastConfigCheck < this.CONFIG_CHECK_INTERVAL_MS) {
      return; // Use cached values
    }

    this.lastConfigCheck = now;

    // Calculate new config hash and compare
    const config = getConfig();
    const newHash = this.calculateConfigHash(config.security.addressAllowlist);

    if (newHash !== this.configHash) {
      this.loadFromConfig();
    }
  }

  /**
   * Calculate a simple hash of the config for change detection.
   */
  private calculateConfigHash(allowlistConfig: {
    enabled: boolean;
    mode: string;
    addresses: string[];
    labels: Record<string, string>;
  }): string {
    // Simple hash: concatenate key values
    const parts = [
      allowlistConfig.enabled ? '1' : '0',
      allowlistConfig.mode,
      ...allowlistConfig.addresses.sort(),
      ...Object.entries(allowlistConfig.labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`),
    ];
    return parts.join('|');
  }

  /**
   * Load configuration from the config system.
   */
  private loadFromConfig(): void {
    const config = getConfig();
    const allowlistConfig = config.security.addressAllowlist;

    // Update cached hash
    this.configHash = this.calculateConfigHash(allowlistConfig);
    this.lastConfigCheck = Date.now();

    this.enabled = allowlistConfig.enabled;
    this.mode = allowlistConfig.mode;

    // Clear and reload addresses
    this.addressSet.clear();
    this.labels.clear();

    for (const address of allowlistConfig.addresses) {
      const normalized = address.toLowerCase();
      this.addressSet.add(normalized);
    }

    // Load labels
    for (const [address, label] of Object.entries(allowlistConfig.labels)) {
      this.labels.set(address.toLowerCase(), label);
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance */
let instance: AddressAllowlistManager | null = null;

/**
 * Get the singleton AddressAllowlistManager instance.
 */
export function getAddressAllowlistManager(): AddressAllowlistManager {
  if (!instance) {
    instance = new AddressAllowlistManager();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetAddressAllowlistManager(): void {
  instance = null;
}

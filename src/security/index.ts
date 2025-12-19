/**
 * Security Layer Module
 *
 * Unified security facade that combines all security components:
 * - Spending limits
 * - Address allowlist/blocklist
 * - Rate limiting
 * - Audit logging
 *
 * Use the SecurityLayer class for convenient access to all security
 * validations in payment tools.
 */

import type { Address } from 'viem';

import {
  getSpendingLimitsManager,
  type SpendingValidationParams,
} from './spending-limits.js';
import { getAddressAllowlistManager } from './address-allowlist.js';
import {
  getRateLimiter,
  type RateLimitCategory,
  type RateLimitResult,
} from './rate-limiter.js';
import {
  getAuditLogger,
  type AuditLogEntry,
  type LogParams,
} from './audit-logger.js';

// =============================================================================
// Re-exports
// =============================================================================

// Re-export for convenience
export {
  getSpendingLimitsManager,
  resetSpendingLimitsManager,
  type SpendingValidationParams,
} from './spending-limits.js';

export {
  getAddressAllowlistManager,
  resetAddressAllowlistManager,
  type AddressValidationResult,
} from './address-allowlist.js';

export {
  getRateLimiter,
  resetRateLimiter,
  type RateLimitCategory,
  type RateLimitResult,
} from './rate-limiter.js';

export {
  getAuditLogger,
  resetAuditLogger,
  type AuditLogEntry,
  type AuditResult,
  type LogParams,
} from './audit-logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Parameters for validating a payment.
 */
export interface PaymentValidationParams {
  /** Token symbol */
  token: string;
  /** Recipient address */
  to: Address;
  /** Amount in human-readable units */
  amount: string;
  /** Is this a batch operation */
  isBatch?: boolean;
  /** Total batch amount */
  batchTotal?: string;
  /** Number of recipients in batch */
  recipientCount?: number;
}

/**
 * Result of payment validation.
 */
export interface ValidationResult {
  /** Whether all validations passed */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
}

// =============================================================================
// SecurityLayer Class
// =============================================================================

/**
 * Unified security layer facade.
 *
 * Provides a single entry point for all security validations.
 * Use validatePayment() to run all relevant checks before
 * executing a payment.
 *
 * @example
 * ```typescript
 * const security = getSecurityLayer();
 *
 * // Validate before payment
 * await security.validatePayment({
 *   token: 'AlphaUSD',
 *   to: '0x742d...',
 *   amount: '100.00'
 * });
 *
 * // Log after payment
 * await security.logSuccess({
 *   tool: 'send_payment',
 *   arguments: { token, to, amount },
 *   durationMs: 1200,
 *   transactionHash: '0xabc...'
 * });
 * ```
 */
export class SecurityLayer {
  private spendingLimits = getSpendingLimitsManager();
  private addressAllowlist = getAddressAllowlistManager();
  private rateLimiter = getRateLimiter();
  private auditLogger = getAuditLogger();

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  /**
   * Validate a payment against all security policies.
   *
   * Runs the following checks in order:
   * 1. Rate limiting (general and high-risk)
   * 2. Address allowlist/blocklist
   * 3. Spending limits
   * 4. Per-recipient rate limiting
   *
   * Throws the first error encountered.
   *
   * @param params - Payment validation parameters
   * @throws SecurityError if any validation fails
   */
  async validatePayment(params: PaymentValidationParams): Promise<void> {
    // 1. Check general rate limit
    this.rateLimiter.validate('toolCalls');

    // 2. Check high-risk operation rate limit
    this.rateLimiter.validate('highRiskOps');

    // 3. Check address allowlist/blocklist
    this.addressAllowlist.validate(params.to);

    // 4. Check spending limits
    this.spendingLimits.validate({
      token: params.token,
      amount: params.amount,
      isBatch: params.isBatch,
      batchTotal: params.batchTotal,
      recipientCount: params.recipientCount,
    });

    // 5. Check per-recipient rate limit
    this.rateLimiter.validate('perRecipient', params.to);
  }

  /**
   * Record a successful payment.
   *
   * Updates spending totals and rate limiting counters.
   * Call this after a payment succeeds.
   *
   * @param params - Payment parameters
   */
  recordPayment(params: { token: string; to: Address; amount: string }): void {
    // Record spending
    this.spendingLimits.recordSpending(params.token, params.amount);

    // Record rate limit hits
    this.rateLimiter.recordRequest('toolCalls');
    this.rateLimiter.recordRequest('highRiskOps');
    this.rateLimiter.recordRequest('perRecipient', params.to);
  }

  /**
   * Check spending limits without throwing.
   *
   * @param params - Spending validation parameters
   * @returns Validation result
   */
  checkSpendingLimits(params: SpendingValidationParams): ValidationResult {
    try {
      this.spendingLimits.validate(params);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Check address allowlist without throwing.
   *
   * @param address - Address to check
   * @returns Validation result
   */
  checkAddressAllowlist(address: string): ValidationResult {
    const result = this.addressAllowlist.check(address);
    return {
      valid: result.allowed,
      errors: result.reason ? [result.reason] : [],
    };
  }

  /**
   * Check rate limit without throwing.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   * @returns Rate limit check result
   */
  checkRateLimit(category: RateLimitCategory, key?: string): RateLimitResult {
    return this.rateLimiter.check(category, key);
  }

  // ===========================================================================
  // Audit Logging Methods
  // ===========================================================================

  /**
   * Log an operation to the audit log.
   *
   * @param params - Log parameters
   * @returns The created log entry
   */
  async log(params: LogParams): Promise<AuditLogEntry> {
    return this.auditLogger.log(params);
  }

  /**
   * Log a successful operation.
   *
   * @param params - Success log parameters
   * @returns The created log entry
   */
  async logSuccess(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    transactionHash?: string;
    gasCost?: string;
  }): Promise<AuditLogEntry> {
    return this.auditLogger.logSuccess(params);
  }

  /**
   * Log a failed operation.
   *
   * @param params - Failure log parameters
   * @returns The created log entry
   */
  async logFailure(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    errorMessage: string;
    errorCode?: number;
  }): Promise<AuditLogEntry> {
    return this.auditLogger.logFailure(params);
  }

  /**
   * Log a rejected operation (security policy).
   *
   * @param params - Rejection log parameters
   * @returns The created log entry
   */
  async logRejected(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    rejectionReason: string;
  }): Promise<AuditLogEntry> {
    return this.auditLogger.logRejected(params);
  }

  // ===========================================================================
  // Accessor Methods
  // ===========================================================================

  /**
   * Get the spending limits manager.
   */
  getSpendingLimits() {
    return this.spendingLimits;
  }

  /**
   * Get the address allowlist manager.
   */
  getAddressAllowlist() {
    return this.addressAllowlist;
  }

  /**
   * Get the rate limiter.
   */
  getRateLimiter() {
    return this.rateLimiter;
  }

  /**
   * Get the audit logger.
   */
  getAuditLogger() {
    return this.auditLogger;
  }

  /**
   * Get remaining spending allowance.
   *
   * @param token - Token symbol
   * @returns Remaining allowance info
   */
  getRemainingAllowance(token: string): {
    tokenRemaining: number;
    totalRemaining: number;
  } {
    return this.spendingLimits.getRemainingAllowance(token);
  }

  /**
   * Get recent audit logs.
   *
   * @param count - Number of entries to return
   * @returns Recent log entries
   */
  getRecentLogs(count: number = 10): AuditLogEntry[] {
    return this.auditLogger.getRecentLogs(count);
  }

  /**
   * Get audit logs for a specific request ID.
   *
   * Enables correlation of all audit entries for a single request,
   * useful for debugging and tracing request flows.
   *
   * @param requestId - Request ID to search for
   * @returns Matching log entries
   */
  getLogsByRequestId(requestId: string): AuditLogEntry[] {
    return this.auditLogger.getLogsByRequestId(requestId);
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance */
let instance: SecurityLayer | null = null;

/**
 * Get the singleton SecurityLayer instance.
 */
export function getSecurityLayer(): SecurityLayer {
  if (!instance) {
    instance = new SecurityLayer();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetSecurityLayer(): void {
  instance = null;
}

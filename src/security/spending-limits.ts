/**
 * Spending Limits Security Module
 *
 * Enforces spending limits to prevent excessive outflows.
 * Tracks daily spending in memory and validates against configured limits.
 *
 * Features:
 * - Per-token spending limits
 * - Total daily limit across all tokens
 * - Per-transaction limits
 * - Batch transaction limits
 *
 */

import { getConfig } from '../config/index.js';
import { SecurityError, ValidationError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Daily spending record for a single token.
 */
interface TokenSpending {
  /** Total amount spent today */
  amount: number;
  /** Number of transactions today */
  count: number;
  /** Date string (YYYY-MM-DD) for today */
  date: string;
}

/**
 * Parameters for spending validation.
 */
export interface SpendingValidationParams {
  /** Token symbol (e.g., "AlphaUSD") */
  token: string;
  /** Amount to spend (human-readable units) */
  amount: string;
  /** Is this a batch transaction? */
  isBatch?: boolean;
  /** Total batch amount (if batch) */
  batchTotal?: string;
  /** Number of recipients (if batch) */
  recipientCount?: number;
}

// =============================================================================
// SpendingLimitsManager Class
// =============================================================================

/**
 * Manages spending limit validation and tracking.
 *
 * Tracks daily spending in memory and validates transactions
 * against configured limits. Automatically resets at midnight.
 */
export class SpendingLimitsManager {
  /** Per-token daily spending tracking */
  private tokenSpending: Map<string, TokenSpending> = new Map();

  /** Total daily spending in USD equivalent */
  private totalDailySpending = 0;

  /** Date of last spending (for reset detection) */
  private lastSpendingDate: string = '';

  constructor() {
    this.resetIfNewDay();
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Validate a payment against spending limits.
   *
   * Checks:
   * 1. Per-transaction limit for the token
   * 2. Daily limit for the token
   * 3. Total daily limit across all tokens
   * 4. Batch-specific limits (if applicable)
   *
   * @param params - Spending validation parameters
   * @throws SecurityError if any limit is exceeded
   */
  validate(params: SpendingValidationParams): void {
    this.resetIfNewDay();

    const config = getConfig();
    const limits = config.security.spendingLimits;
    const amount = parseFloat(params.amount);

    // SECURITY FIX: Reject invalid amounts instead of silently passing
    // This prevents Infinity, NaN, and negative amounts from bypassing limits
    if (isNaN(amount) || !isFinite(amount)) {
      throw ValidationError.invalidAmount(params.amount);
    }

    if (amount <= 0) {
      throw ValidationError.invalidAmount(params.amount);
    }

    // Get token-specific limit or fallback to wildcard
    // SECURITY FIX: Default to 0 (deny) instead of Infinity (allow)
    // This ensures unconfigured tokens are blocked, not unlimited
    const getLimit = (
      limitMap: Record<string, string>,
      token: string
    ): number => {
      const tokenLimit = limitMap[token];
      if (tokenLimit !== undefined) {
        const parsed = parseFloat(tokenLimit);
        return isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      const wildcardLimit = limitMap['*'];
      if (wildcardLimit !== undefined) {
        const parsed = parseFloat(wildcardLimit);
        return isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      return 0; // No limit configured = deny by default
    };

    // 1. Check per-transaction limit
    const maxSingle = getLimit(limits.maxSinglePayment, params.token);
    if (amount > maxSingle) {
      throw SecurityError.spendingLimitExceeded(
        params.amount,
        maxSingle.toString(),
        params.token
      );
    }

    // 2. Check daily limit for token
    const dailyLimit = getLimit(limits.dailyLimit, params.token);
    const currentSpending = this.getTokenSpending(params.token);
    const projectedSpending = currentSpending.amount + amount;

    if (projectedSpending > dailyLimit) {
      throw SecurityError.dailyLimitExceeded(
        currentSpending.amount.toString(),
        dailyLimit.toString(),
        params.token
      );
    }

    // 3. Check total daily limit
    const totalDailyLimit = parseFloat(limits.dailyTotalUSD);
    const projectedTotal = this.totalDailySpending + amount;

    if (projectedTotal > totalDailyLimit) {
      throw SecurityError.dailyLimitExceeded(
        this.totalDailySpending.toString(),
        limits.dailyTotalUSD,
        'USD (total)'
      );
    }

    // 4. Batch-specific validations
    if (params.isBatch) {
      // Check batch size
      if (
        params.recipientCount !== undefined &&
        params.recipientCount > limits.maxBatchSize
      ) {
        throw new SecurityError(
          2001,
          `Batch size exceeds limit: ${params.recipientCount} recipients (max ${limits.maxBatchSize})`,
          {
            details: {
              received: `${params.recipientCount} recipients`,
              expected: `Max ${limits.maxBatchSize} recipients per batch`,
              suggestion: 'Split into multiple smaller batches',
            },
            recoverable: true,
          }
        );
      }

      // SECURITY FIX: Require batchTotal when isBatch=true
      // Don't allow fallback to individual amount which bypasses batch limits
      if (params.batchTotal === undefined) {
        throw new SecurityError(
          2001,
          'Batch total amount is required for batch payments',
          {
            details: {
              suggestion: 'Provide batchTotal parameter for batch payment validation',
            },
            recoverable: true,
          }
        );
      }

      // Check batch total
      const batchTotal = parseFloat(params.batchTotal);
      if (!isFinite(batchTotal) || batchTotal <= 0) {
        throw ValidationError.invalidAmount(params.batchTotal);
      }
      const maxBatchTotal = parseFloat(limits.maxBatchTotalUSD);

      if (batchTotal > maxBatchTotal) {
        throw new SecurityError(
          2001,
          `Batch total exceeds limit: ${batchTotal} USD (max ${maxBatchTotal})`,
          {
            details: {
              received: `${batchTotal} USD total`,
              expected: `Max ${limits.maxBatchTotalUSD} USD per batch`,
              suggestion: 'Split into multiple smaller batches',
            },
            recoverable: true,
          }
        );
      }
    }
  }

  /**
   * Atomically validate and reserve spending.
   *
   * SECURITY FIX: This method combines validation and reservation into a single
   * atomic operation to prevent TOCTOU (time-of-check-to-time-of-use) race conditions.
   *
   * The amount is reserved immediately after validation. If the transaction fails,
   * call the returned release function to undo the reservation.
   *
   * @param params - Spending validation parameters
   * @returns A release function to call if the transaction fails
   * @throws SecurityError if spending limits are exceeded
   */
  validateAndReserve(params: SpendingValidationParams): () => void {
    // Validate first (throws if invalid)
    this.validate(params);

    const amount = parseFloat(params.amount);

    // Reserve the amount immediately (same as recordSpending)
    const current = this.getTokenSpending(params.token);
    current.amount += amount;
    current.count += 1;
    this.tokenSpending.set(params.token, current);
    this.totalDailySpending += amount;

    // Return a release function to undo the reservation if transaction fails
    let released = false;
    return () => {
      if (released) return; // Prevent double-release
      released = true;

      // Undo the reservation
      const spending = this.tokenSpending.get(params.token);
      if (spending) {
        spending.amount = Math.max(0, spending.amount - amount);
        spending.count = Math.max(0, spending.count - 1);
      }
      this.totalDailySpending = Math.max(0, this.totalDailySpending - amount);
    };
  }

  /**
   * Record a successful payment for tracking.
   *
   * Call this after a payment succeeds to update the spending totals.
   *
   * NOTE: Consider using validateAndReserve() instead to prevent race conditions.
   *
   * @param token - Token symbol
   * @param amount - Amount spent (human-readable units)
   */
  recordSpending(token: string, amount: string): void {
    this.resetIfNewDay();

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || !isFinite(amountNum) || amountNum <= 0) {
      return;
    }

    // Update token spending
    const current = this.getTokenSpending(token);
    current.amount += amountNum;
    current.count += 1;
    this.tokenSpending.set(token, current);

    // Update total spending (assuming 1:1 USD for stablecoins)
    this.totalDailySpending += amountNum;
  }

  /**
   * Get current spending for a token.
   *
   * @param token - Token symbol
   * @returns Current spending record
   */
  getTokenSpending(token: string): TokenSpending {
    this.resetIfNewDay();

    const existing = this.tokenSpending.get(token);
    if (existing && existing.date === this.getTodayDate()) {
      return existing;
    }

    // Return fresh record for today
    return {
      amount: 0,
      count: 0,
      date: this.getTodayDate(),
    };
  }

  /**
   * Get total daily spending across all tokens.
   *
   * @returns Total USD equivalent spent today
   */
  getTotalDailySpending(): number {
    this.resetIfNewDay();
    return this.totalDailySpending;
  }

  /**
   * Get remaining spending allowance.
   *
   * @param token - Token symbol
   * @returns Remaining allowance for today
   */
  getRemainingAllowance(token: string): {
    tokenRemaining: number;
    totalRemaining: number;
  } {
    this.resetIfNewDay();

    const config = getConfig();
    const limits = config.security.spendingLimits;

    // Get daily limit for token (default to 0 = no remaining allowance)
    const dailyLimitStr = limits.dailyLimit[token] ?? limits.dailyLimit['*'];
    const dailyLimit = dailyLimitStr ? parseFloat(dailyLimitStr) : 0;
    const safeDailyLimit = isFinite(dailyLimit) && dailyLimit >= 0 ? dailyLimit : 0;
    const currentSpending = this.getTokenSpending(token).amount;
    const tokenRemaining = Math.max(0, safeDailyLimit - currentSpending);

    // Get total remaining
    const totalDailyLimit = parseFloat(limits.dailyTotalUSD);
    const totalRemaining = Math.max(0, totalDailyLimit - this.totalDailySpending);

    return {
      tokenRemaining,
      totalRemaining,
    };
  }

  /**
   * Reset all spending records.
   *
   * Primarily useful for testing.
   */
  reset(): void {
    this.tokenSpending.clear();
    this.totalDailySpending = 0;
    this.lastSpendingDate = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get today's date as YYYY-MM-DD string.
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Reset spending if it's a new day.
   */
  private resetIfNewDay(): void {
    const today = this.getTodayDate();

    if (this.lastSpendingDate !== today) {
      this.tokenSpending.clear();
      this.totalDailySpending = 0;
      this.lastSpendingDate = today;
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance */
let instance: SpendingLimitsManager | null = null;

/**
 * Get the singleton SpendingLimitsManager instance.
 */
export function getSpendingLimitsManager(): SpendingLimitsManager {
  if (!instance) {
    instance = new SpendingLimitsManager();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetSpendingLimitsManager(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

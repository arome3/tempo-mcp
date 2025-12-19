/**
 * Rate Limiter Security Module
 *
 * Implements sliding window rate limiting to prevent abuse.
 *
 * Categories:
 * - toolCalls: General tool invocations
 * - highRiskOps: Payment and other high-risk operations
 * - perRecipient: Payments to specific addresses
 *
 */

import { getConfig } from '../config/index.js';
import { SecurityError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Rate limit categories.
 */
export type RateLimitCategory = 'toolCalls' | 'highRiskOps' | 'perRecipient';

/**
 * Record of requests within a time window.
 */
interface RequestRecord {
  /** Timestamps of requests (ms since epoch) */
  timestamps: number[];
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  currentCount: number;
  /** Maximum allowed requests */
  maxCount: number;
  /** Seconds until rate limit resets */
  resetInSeconds: number;
  /** Seconds to wait before retry (if rate limited) */
  retryAfter?: number;
}

// =============================================================================
// RateLimiter Class
// =============================================================================

/**
 * Sliding window rate limiter.
 *
 * Tracks request timestamps and validates against configured limits.
 * Uses a sliding window approach for smooth rate limiting.
 *
 * SECURITY: Uses atomic check-and-record to prevent TOCTOU race conditions.
 */
export class RateLimiter {
  /**
   * Request records by category.
   * For perRecipient, keys are "perRecipient:0x..." format.
   */
  private records: Map<string, RequestRecord> = new Map();

  /**
   * Counter for operations to trigger periodic cleanup.
   * SECURITY FIX: Prevents memory leak by cleaning up on read operations too.
   */
  private operationCount = 0;

  /** Cleanup runs every N operations */
  private readonly CLEANUP_INTERVAL = 100;

  /** Maximum timestamps to keep per key (safety limit) */
  private readonly MAX_TIMESTAMPS_PER_KEY = 1000;

  constructor() {}

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Check if a request is allowed under rate limits.
   *
   * Does NOT record the request - call recordRequest() separately after
   * the operation succeeds.
   *
   * NOTE: For atomic check-and-record, use checkAndRecordAtomic() instead.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key (e.g., recipient address for perRecipient)
   * @returns Rate limit check result
   */
  check(category: RateLimitCategory, key?: string): RateLimitResult {
    // SECURITY FIX: Trigger periodic cleanup to prevent memory leaks
    this.maybeCleanup();

    const config = getConfig();
    const limits = config.security.rateLimits;

    // Get the appropriate limit configuration
    const limitConfig = limits[category];
    const { windowMs, maxCalls } = limitConfig;

    // Build the full key
    const fullKey = key ? `${category}:${key.toLowerCase()}` : category;

    // Get current window stats
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create record
    const record = this.records.get(fullKey) ?? { timestamps: [] };

    // Filter to only requests within the window
    const activeTimestamps = record.timestamps.filter((ts) => ts > windowStart);
    const currentCount = activeTimestamps.length;

    // Calculate reset time (when oldest request falls out of window)
    let resetInSeconds = Math.ceil(windowMs / 1000);
    if (activeTimestamps.length > 0) {
      const oldestTimestamp = Math.min(...activeTimestamps);
      const expiresAt = oldestTimestamp + windowMs;
      resetInSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    }

    // Check if allowed
    const allowed = currentCount < maxCalls;

    // Calculate retry after if rate limited
    let retryAfter: number | undefined;
    if (!allowed && activeTimestamps.length > 0) {
      // Find when the oldest request will expire
      const oldestTimestamp = Math.min(...activeTimestamps);
      const expiresAt = oldestTimestamp + windowMs;
      retryAfter = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    }

    return {
      allowed,
      currentCount,
      maxCount: maxCalls,
      resetInSeconds,
      retryAfter,
    };
  }

  /**
   * Check rate limit and throw if exceeded.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   * @throws SecurityError if rate limit exceeded
   */
  validate(category: RateLimitCategory, key?: string): void {
    const result = this.check(category, key);

    if (!result.allowed) {
      throw SecurityError.rateLimitExceeded(result.retryAfter ?? 60);
    }
  }

  /**
   * Record a request for rate limiting.
   *
   * Call this after a request succeeds to count it against limits.
   *
   * NOTE: For atomic check-and-record, use checkAndRecordAtomic() instead.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   */
  recordRequest(category: RateLimitCategory, key?: string): void {
    const fullKey = key ? `${category}:${key.toLowerCase()}` : category;

    // Get or create record
    let record = this.records.get(fullKey);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(fullKey, record);
    }

    // Add current timestamp
    record.timestamps.push(Date.now());

    // SECURITY FIX: Enforce maximum timestamps per key to prevent memory exhaustion
    if (record.timestamps.length > this.MAX_TIMESTAMPS_PER_KEY) {
      // Keep only the most recent timestamps
      record.timestamps = record.timestamps.slice(-this.MAX_TIMESTAMPS_PER_KEY);
    }

    // Cleanup old entries periodically
    this.cleanupRecord(fullKey);
  }

  /**
   * Check and record in one operation.
   *
   * Validates the request and records it if allowed.
   *
   * WARNING: This method has a TOCTOU vulnerability between check and record.
   * Use checkAndRecordAtomic() for security-critical operations.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   * @throws SecurityError if rate limit exceeded
   * @deprecated Use checkAndRecordAtomic() instead for security-critical operations
   */
  checkAndRecord(category: RateLimitCategory, key?: string): void {
    this.validate(category, key);
    this.recordRequest(category, key);
  }

  /**
   * Atomically check and record a request.
   *
   * SECURITY FIX: This method prevents TOCTOU race conditions by recording
   * the timestamp BEFORE checking the limit, then rolling back if over limit.
   *
   * This ensures that concurrent requests cannot all pass the check before
   * any of them records - each request sees the others' timestamps.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   * @returns Release function to undo the record if operation fails
   * @throws SecurityError if rate limit exceeded
   */
  checkAndRecordAtomic(
    category: RateLimitCategory,
    key?: string
  ): () => void {
    this.maybeCleanup();

    const config = getConfig();
    const limits = config.security.rateLimits;
    const limitConfig = limits[category];
    const { windowMs, maxCalls } = limitConfig;

    const fullKey = key ? `${category}:${key.toLowerCase()}` : category;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create record
    let record = this.records.get(fullKey);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(fullKey, record);
    }

    // ATOMIC: Add timestamp FIRST (reserve our slot)
    record.timestamps.push(now);

    // Enforce max timestamps
    if (record.timestamps.length > this.MAX_TIMESTAMPS_PER_KEY) {
      record.timestamps = record.timestamps.slice(-this.MAX_TIMESTAMPS_PER_KEY);
    }

    // Now check count including our new timestamp
    const activeCount = record.timestamps.filter((ts) => ts > windowStart).length;

    // If over limit, remove our timestamp and throw
    if (activeCount > maxCalls) {
      // Roll back - remove the timestamp we just added
      const idx = record.timestamps.lastIndexOf(now);
      if (idx !== -1) {
        record.timestamps.splice(idx, 1);
      }

      // Calculate retry after
      const oldestActive = record.timestamps
        .filter((ts) => ts > windowStart)
        .sort((a, b) => a - b)[0];
      const retryAfter = oldestActive
        ? Math.max(1, Math.ceil((oldestActive + windowMs - now) / 1000))
        : 60;

      throw SecurityError.rateLimitExceeded(retryAfter);
    }

    // Return release function for rollback if operation fails
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const currentRecord = this.records.get(fullKey);
      if (currentRecord) {
        const idx = currentRecord.timestamps.lastIndexOf(now);
        if (idx !== -1) {
          currentRecord.timestamps.splice(idx, 1);
        }
      }
    };
  }

  /**
   * Get current stats for a category.
   *
   * @param category - Rate limit category
   * @param key - Optional sub-key
   * @returns Current rate limit stats
   */
  getStats(
    category: RateLimitCategory,
    key?: string
  ): {
    currentCount: number;
    maxCount: number;
    windowMs: number;
    remainingRequests: number;
  } {
    const config = getConfig();
    const limits = config.security.rateLimits;
    const limitConfig = limits[category];

    const result = this.check(category, key);

    return {
      currentCount: result.currentCount,
      maxCount: limitConfig.maxCalls,
      windowMs: limitConfig.windowMs,
      remainingRequests: Math.max(0, limitConfig.maxCalls - result.currentCount),
    };
  }

  /**
   * Reset rate limits for a specific category.
   *
   * @param category - Rate limit category to reset
   * @param key - Optional sub-key to reset
   */
  reset(category?: RateLimitCategory, key?: string): void {
    if (!category) {
      // Reset all
      this.records.clear();
      return;
    }

    if (key) {
      // Reset specific key
      const fullKey = `${category}:${key.toLowerCase()}`;
      this.records.delete(fullKey);
    } else {
      // Reset entire category
      for (const recordKey of this.records.keys()) {
        if (recordKey === category || recordKey.startsWith(`${category}:`)) {
          this.records.delete(recordKey);
        }
      }
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Trigger cleanup periodically based on operation count.
   *
   * SECURITY FIX: Prevents memory leaks by ensuring cleanup runs even
   * on read-only operations (check/validate), not just on recordRequest.
   */
  private maybeCleanup(): void {
    this.operationCount++;

    if (this.operationCount >= this.CLEANUP_INTERVAL) {
      this.operationCount = 0;
      this.cleanup();
    }
  }

  /**
   * Clean up old timestamps from a record.
   */
  private cleanupRecord(key: string): void {
    const record = this.records.get(key);
    if (!record) return;

    // Get the maximum window size across all categories
    const config = getConfig();
    const limits = config.security.rateLimits;
    const maxWindow = Math.max(
      limits.toolCalls.windowMs,
      limits.highRiskOps.windowMs,
      limits.perRecipient.windowMs
    );

    const cutoff = Date.now() - maxWindow;

    // Remove timestamps older than the maximum window
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);

    // Remove empty records
    if (record.timestamps.length === 0) {
      this.records.delete(key);
    }
  }

  /**
   * Clean up all old records.
   *
   * Call periodically to prevent memory growth.
   */
  cleanup(): void {
    for (const key of this.records.keys()) {
      this.cleanupRecord(key);
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance */
let instance: RateLimiter | null = null;

/**
 * Get the singleton RateLimiter instance.
 */
export function getRateLimiter(): RateLimiter {
  if (!instance) {
    instance = new RateLimiter();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetRateLimiter(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

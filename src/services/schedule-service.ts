/**
 * Schedule Service
 *
 * Service for managing scheduled payments on the Tempo blockchain.
 * Handles creation, cancellation, and tracking of scheduled transactions.
 *
 * Note: Schedule records are stored in-memory only. Schedules exist on-chain
 * via TempoTransaction, so local tracking is for convenience (cancellation,
 * status queries) within the same session. Records are lost on restart.
 */

import { parseUnits, encodeFunctionData, type Address, type Hash } from 'viem';
import {
  getTempoClient,
  TIP20_ABI,
  type ScheduledTransactionParams,
} from './tempo-client.js';
import { stringToBytes32 } from '../utils/formatting.js';
import { ValidationError } from '../utils/errors.js';
import type { RecurringConfig } from '../tools/payments/schedule-schemas.js';

// =============================================================================
// Type Definitions
// =============================================================================

/** Schedule record status */
export type ScheduleStatus =
  | 'pending'
  | 'scheduled'
  | 'executed'
  | 'cancelled'
  | 'expired';

/** Internal schedule record */
export interface ScheduleRecord {
  /** Unique schedule identifier */
  id: string;
  /** Transaction hash for the scheduled transaction */
  transactionHash: Hash;
  /** Token contract address */
  tokenAddress: Address;
  /** Token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
  /** Recipient address */
  to: Address;
  /** Amount in human-readable units */
  amount: string;
  /** Amount in wei */
  amountRaw: string;
  /** Optional memo */
  memo?: string;
  /** Scheduled execution time */
  executeAt: Date;
  /** Optional earliest execution time */
  validFrom?: Date;
  /** Optional expiration time */
  validUntil?: Date;
  /** Optional recurring configuration (schema only, not implemented) */
  recurring?: RecurringConfig;
  /** When the schedule was created */
  createdAt: Date;
  /** Current status */
  status: ScheduleStatus;
}

/** Parameters for creating a scheduled payment */
export interface CreateScheduleParams {
  /** Token contract address */
  tokenAddress: Address;
  /** Token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
  /** Recipient address */
  to: Address;
  /** Amount in human-readable units */
  amount: string;
  /** Optional memo (max 32 bytes) */
  memo?: string;
  /** Scheduled execution time */
  executeAt: Date;
  /** Optional earliest execution time */
  validFrom?: Date;
  /** Optional expiration time */
  validUntil?: Date;
  /** Optional recurring configuration (schema only) */
  recurring?: RecurringConfig;
}

/** Result of creating a scheduled payment */
export interface CreateScheduleResult {
  /** Unique schedule identifier */
  scheduleId: string;
  /** Transaction hash */
  transactionHash: Hash;
  /** Schedule status */
  status: ScheduleStatus;
  /** Full schedule record */
  record: ScheduleRecord;
}

// =============================================================================
// ScheduleService Class
// =============================================================================

/**
 * Service for managing scheduled payments.
 *
 * Provides functionality to create, cancel, and query scheduled payments.
 * Uses in-memory storage for tracking schedules within a session.
 *
 * @example
 * ```typescript
 * const service = getScheduleService();
 *
 * // Create a scheduled payment
 * const result = await service.createSchedule({
 *   tokenAddress: '0x20c0...',
 *   tokenSymbol: 'AlphaUSD',
 *   decimals: 6,
 *   to: '0x742d...',
 *   amount: '100.00',
 *   executeAt: new Date('2024-12-25T00:00:00Z'),
 * });
 *
 * // Cancel the schedule
 * await service.cancelSchedule(result.scheduleId);
 * ```
 */
export class ScheduleService {
  /** In-memory storage for schedule records */
  private readonly schedules: Map<string, ScheduleRecord> = new Map();

  /** Counter for generating unique IDs */
  private idCounter = 0;

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Create a scheduled payment.
   *
   * Submits a scheduled transaction to the Tempo network using
   * TempoTransaction (type 0x76) with scheduling fields.
   *
   * @param params - Schedule creation parameters
   * @returns Schedule result with ID and transaction hash
   * @throws Error if scheduling fails
   */
  async createSchedule(params: CreateScheduleParams): Promise<CreateScheduleResult> {
    const {
      tokenAddress,
      tokenSymbol,
      decimals,
      to,
      amount,
      memo,
      executeAt,
      validFrom,
      validUntil,
      recurring,
    } = params;

    const client = getTempoClient();

    // Convert amount to wei
    const amountWei = parseUnits(amount, decimals);

    // Encode the transfer function call
    const data = memo
      ? encodeFunctionData({
          abi: TIP20_ABI,
          functionName: 'transferWithMemo',
          args: [to, amountWei, stringToBytes32(memo)],
        })
      : encodeFunctionData({
          abi: TIP20_ABI,
          functionName: 'transfer',
          args: [to, amountWei],
        });

    // Build scheduled transaction params
    const txParams: ScheduledTransactionParams = {
      to: tokenAddress,
      data,
      scheduledAt: Math.floor(executeAt.getTime() / 1000),
      validFrom: validFrom ? Math.floor(validFrom.getTime() / 1000) : undefined,
      validUntil: validUntil ? Math.floor(validUntil.getTime() / 1000) : undefined,
    };

    // Submit the scheduled transaction
    const transactionHash = await client.sendScheduledTransaction(txParams);

    // Generate unique schedule ID
    const scheduleId = this.generateScheduleId(transactionHash);

    // Create schedule record
    const record: ScheduleRecord = {
      id: scheduleId,
      transactionHash,
      tokenAddress,
      tokenSymbol,
      decimals,
      to,
      amount,
      amountRaw: amountWei.toString(),
      memo,
      executeAt,
      validFrom,
      validUntil,
      recurring,
      createdAt: new Date(),
      status: 'scheduled',
    };

    // Store the record
    this.schedules.set(scheduleId, record);

    return {
      scheduleId,
      transactionHash,
      status: 'scheduled',
      record,
    };
  }

  /**
   * Cancel a scheduled payment.
   *
   * Removes the schedule from local tracking. Note that once a transaction
   * is submitted to the Tempo network, it cannot be cancelled on-chain.
   * This method only removes local tracking.
   *
   * @param scheduleId - ID of the schedule to cancel
   * @returns True if cancelled successfully
   * @throws Error if schedule not found or already executed
   */
  async cancelSchedule(scheduleId: string): Promise<boolean> {
    const record = this.schedules.get(scheduleId);

    if (!record) {
      throw ValidationError.custom(
        'scheduleId',
        `Schedule not found: ${scheduleId}`,
        scheduleId
      );
    }

    if (record.status === 'executed') {
      throw ValidationError.custom(
        'scheduleId',
        `Cannot cancel: schedule ${scheduleId} has already been executed`,
        scheduleId
      );
    }

    if (record.status === 'cancelled') {
      throw ValidationError.custom(
        'scheduleId',
        `Schedule ${scheduleId} is already cancelled`,
        scheduleId
      );
    }

    // Check if expired
    if (record.validUntil && new Date() > record.validUntil) {
      record.status = 'expired';
      throw ValidationError.custom(
        'scheduleId',
        `Cannot cancel: schedule ${scheduleId} has expired`,
        scheduleId
      );
    }

    // Update status to cancelled
    record.status = 'cancelled';

    // Note: In a full implementation, we would attempt to cancel the
    // transaction on-chain if Tempo protocol supports it. For now,
    // we only update local state.

    return true;
  }

  /**
   * Get the status of a scheduled payment.
   *
   * Checks local record and attempts to determine if the transaction
   * has been executed on-chain.
   *
   * @param scheduleId - ID of the schedule to check
   * @returns Current status of the schedule
   * @throws Error if schedule not found
   */
  async getScheduleStatus(scheduleId: string): Promise<ScheduleStatus> {
    const record = this.schedules.get(scheduleId);

    if (!record) {
      throw ValidationError.custom(
        'scheduleId',
        `Schedule not found: ${scheduleId}`,
        scheduleId
      );
    }

    // If already in terminal state, return it
    if (
      record.status === 'executed' ||
      record.status === 'cancelled' ||
      record.status === 'expired'
    ) {
      return record.status;
    }

    // Check if expired
    if (record.validUntil && new Date() > record.validUntil) {
      record.status = 'expired';
      return 'expired';
    }

    // Try to check if transaction has been executed
    try {
      const client = getTempoClient();
      const receipt = await client.waitForTransaction(record.transactionHash);

      if (receipt && receipt.status === 'success') {
        record.status = 'executed';
        return 'executed';
      }
    } catch {
      // Transaction not yet executed or error checking
      // Keep current status
    }

    return record.status;
  }

  /**
   * Get a schedule record by ID.
   *
   * @param scheduleId - ID of the schedule to retrieve
   * @returns Schedule record or null if not found
   */
  getSchedule(scheduleId: string): ScheduleRecord | null {
    return this.schedules.get(scheduleId) ?? null;
  }

  /**
   * Get all schedule records.
   *
   * @returns Array of all schedule records
   */
  getAllSchedules(): ScheduleRecord[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedules by status.
   *
   * @param status - Status to filter by
   * @returns Array of matching schedule records
   */
  getSchedulesByStatus(status: ScheduleStatus): ScheduleRecord[] {
    return Array.from(this.schedules.values()).filter(
      (record) => record.status === status
    );
  }

  /**
   * Clear all schedule records.
   *
   * Primarily useful for testing scenarios.
   */
  clear(): void {
    this.schedules.clear();
    this.idCounter = 0;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate a unique schedule ID.
   *
   * Format: sched_<first 8 chars of tx hash>_<counter>
   *
   * @param transactionHash - Transaction hash to incorporate
   * @returns Unique schedule ID
   */
  private generateScheduleId(transactionHash: Hash): string {
    this.idCounter += 1;
    const hashPart = transactionHash.slice(2, 10);
    return `sched_${hashPart}_${this.idCounter}`;
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: ScheduleService | null = null;

/**
 * Get or create the singleton ScheduleService instance.
 *
 * The service is lazily initialized on first call and cached for
 * subsequent calls. Use resetScheduleService() to force re-initialization.
 *
 * @returns The shared ScheduleService instance
 */
export function getScheduleService(): ScheduleService {
  if (!serviceInstance) {
    serviceInstance = new ScheduleService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios where you need to
 * reinitialize the service with fresh state.
 */
export function resetScheduleService(): void {
  if (serviceInstance) {
    serviceInstance.clear();
  }
  serviceInstance = null;
}

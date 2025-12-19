/**
 * Audit Logger Security Module
 *
 * Records all tool invocations for compliance and debugging.
 * Uses Pino for high-performance structured JSON logging in JSONL format.
 *
 * Features:
 * - Pino-based structured logging with configurable levels
 * - Automatic log file rotation (daily)
 * - Configurable retention period (rotationDays)
 * - In-memory buffer for fast queries
 * - Argument sanitization to prevent credential leaks
 * - Non-blocking writes for performance
 */

import { pino, type Logger, type DestinationStream } from 'pino';
import { stat, rename, readdir, unlink, mkdir } from 'fs/promises';
import { dirname, basename, join } from 'path';
import { getConfig } from '../config/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result status for audit log entries.
 */
export type AuditResult = 'success' | 'failure' | 'rejected';

/**
 * Audit log entry structure.
 */
export interface AuditLogEntry {
  /** Unique log entry ID */
  id: string;
  /** Request ID for correlation (from RequestContext) */
  requestId?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tool name that was invoked */
  tool: string;
  /** Tool arguments (sanitized) */
  arguments: Record<string, unknown>;
  /** Result of the operation */
  result: AuditResult;
  /** Reason for rejection (if rejected) */
  rejectionReason?: string;
  /** Error message (if failure) */
  errorMessage?: string;
  /** Error code (if failure) */
  errorCode?: number;
  /** Transaction hash (if blockchain tx) */
  transactionHash?: string;
  /** Gas cost in fee token (if blockchain tx) */
  gasCost?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** MCP client information */
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

/**
 * Parameters for logging a tool invocation.
 */
export interface LogParams {
  /** Request ID for correlation (from RequestContext) */
  requestId?: string;
  /** Tool name */
  tool: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Result status */
  result: AuditResult;
  /** Rejection reason */
  rejectionReason?: string;
  /** Error message */
  errorMessage?: string;
  /** Error code */
  errorCode?: number;
  /** Transaction hash */
  transactionHash?: string;
  /** Gas cost */
  gasCost?: string;
  /** Duration in ms */
  durationMs: number;
  /** Client info */
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

// =============================================================================
// AuditLogger Class
// =============================================================================

/**
 * Audit logger for tool invocations.
 *
 * Uses Pino for high-performance structured logging to a JSONL file.
 * Supports automatic log rotation and configurable retention.
 *
 * @example
 * ```typescript
 * const logger = getAuditLogger();
 *
 * // Log a successful payment
 * await logger.logSuccess({
 *   tool: 'send_payment',
 *   arguments: { token: 'AlphaUSD', to: '0x...', amount: '100' },
 *   durationMs: 1500,
 *   transactionHash: '0xabc...',
 * });
 *
 * // Query recent logs
 * const recent = logger.getRecentLogs(10);
 * ```
 */
export class AuditLogger {
  /** Whether logging is enabled */
  private enabled: boolean = true;

  /** Path to audit log file */
  private logPath: string = './logs/audit.jsonl';

  /** Days to retain logs before cleanup */
  private rotationDays: number = 30;

  /** Pino logger instance */
  private logger: Logger | null = null;

  /** Pino destination for file output */
  private destination: DestinationStream | null = null;

  /** In-memory log buffer for recent entries */
  private recentLogs: AuditLogEntry[] = [];

  /** Maximum entries to keep in memory */
  private readonly maxRecentLogs = 100;

  /** Whether initialization has completed */
  private initialized: boolean = false;

  constructor() {
    this.loadConfig();
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize the logger.
   *
   * Creates the Pino logger instance and performs log rotation if needed.
   * Called automatically on first log, but can be called explicitly.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.loadConfig();

    if (!this.enabled) {
      this.initialized = true;
      return;
    }

    try {
      // Ensure log directory exists
      await this.ensureDirectory();

      // Rotate logs if needed (check if file is from previous day)
      await this.rotateLogsIfNeeded();

      // Create Pino destination for file output
      this.destination = pino.destination({
        dest: this.logPath,
        sync: false, // Async for performance
        mkdir: true, // Create directory if needed
      });

      // Create Pino logger instance
      const config = getConfig();
      this.logger = pino(
        {
          level: config.logging.level,
          // Use a simple formatter that outputs clean JSON
          formatters: {
            level: (label: string) => ({ level: label }),
          },
          // Don't add extra fields like pid, hostname
          base: undefined,
        },
        this.destination
      );

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
      // Continue without file logging - in-memory buffer still works
      this.initialized = true;
    }
  }

  /**
   * Log a tool invocation.
   *
   * Creates a structured log entry and writes it to the audit log file.
   * Non-blocking - errors are caught and logged to console.
   *
   * @param params - Log parameters
   * @returns The created log entry
   */
  async log(params: LogParams): Promise<AuditLogEntry> {
    // Initialize on first use
    if (!this.initialized) {
      await this.initialize();
    }

    const entry: AuditLogEntry = {
      id: this.generateId(),
      requestId: params.requestId,
      timestamp: new Date().toISOString(),
      tool: params.tool,
      arguments: this.sanitizeArguments(params.arguments),
      result: params.result,
      rejectionReason: params.rejectionReason,
      errorMessage: params.errorMessage,
      errorCode: params.errorCode,
      transactionHash: params.transactionHash,
      gasCost: params.gasCost,
      durationMs: params.durationMs,
      clientInfo: params.clientInfo,
    };

    // Add to recent logs (in-memory)
    this.addToRecentLogs(entry);

    // Write to file via Pino if enabled and logger is available
    if (this.enabled && this.logger) {
      try {
        // Log the entry as info level
        // Pino will serialize it as JSON automatically
        this.logger.info(entry);
      } catch (error) {
        // Non-blocking - don't break operations for logging failures
        console.error('Failed to write audit log:', error);
      }
    }

    return entry;
  }

  /**
   * Log a successful operation.
   *
   * Convenience method for successful tool invocations.
   */
  async logSuccess(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    transactionHash?: string;
    gasCost?: string;
  }): Promise<AuditLogEntry> {
    return this.log({
      ...params,
      result: 'success',
    });
  }

  /**
   * Log a failed operation.
   *
   * Convenience method for failed tool invocations.
   */
  async logFailure(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    errorMessage: string;
    errorCode?: number;
  }): Promise<AuditLogEntry> {
    return this.log({
      ...params,
      result: 'failure',
    });
  }

  /**
   * Log a rejected operation (security policy).
   *
   * Convenience method for security-rejected operations.
   */
  async logRejected(params: {
    requestId?: string;
    tool: string;
    arguments: Record<string, unknown>;
    durationMs: number;
    rejectionReason: string;
  }): Promise<AuditLogEntry> {
    return this.log({
      ...params,
      result: 'rejected',
    });
  }

  /**
   * Get recent log entries (from memory).
   *
   * @param count - Maximum entries to return (default: 10)
   * @returns Recent log entries, newest first
   */
  getRecentLogs(count: number = 10): AuditLogEntry[] {
    return this.recentLogs.slice(-count).reverse();
  }

  /**
   * Get logs for a specific transaction hash.
   *
   * @param transactionHash - Transaction hash to search for
   * @returns Matching log entries
   */
  getLogsByTransaction(transactionHash: string): AuditLogEntry[] {
    return this.recentLogs.filter(
      (entry) =>
        entry.transactionHash?.toLowerCase() === transactionHash.toLowerCase()
    );
  }

  /**
   * Get logs for a specific request ID.
   *
   * Enables correlation of all audit entries for a single request,
   * useful for debugging and tracing request flows.
   *
   * @param requestId - Request ID to search for
   * @returns Matching log entries in chronological order
   */
  getLogsByRequestId(requestId: string): AuditLogEntry[] {
    return this.recentLogs.filter((entry) => entry.requestId === requestId);
  }

  /**
   * Get logs for a specific tool.
   *
   * @param tool - Tool name
   * @param limit - Maximum entries (default: 10)
   * @returns Matching log entries
   */
  getLogsByTool(tool: string, limit: number = 10): AuditLogEntry[] {
    return this.recentLogs
      .filter((entry) => entry.tool === tool)
      .slice(-limit)
      .reverse();
  }

  /**
   * Check if audit logging is enabled.
   */
  isEnabled(): boolean {
    this.loadConfig();
    return this.enabled;
  }

  /**
   * Get the audit log file path.
   */
  getLogPath(): string {
    this.loadConfig();
    return this.logPath;
  }

  /**
   * Clear in-memory logs (for testing).
   */
  clearRecentLogs(): void {
    this.recentLogs = [];
  }

  /**
   * Flush pending log writes and close the logger.
   *
   * Call this during graceful shutdown to ensure all logs are written.
   */
  async close(): Promise<void> {
    if (this.destination) {
      // Flush any pending writes
      const dest = this.destination as DestinationStream & { flushSync?: () => void };
      if (typeof dest.flushSync === 'function') {
        dest.flushSync();
      }
    }
    this.logger = null;
    this.destination = null;
    this.initialized = false;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Load configuration from config system.
   */
  private loadConfig(): void {
    const config = getConfig();
    const auditConfig = config.logging.auditLog;

    this.enabled = auditConfig.enabled;
    this.logPath = auditConfig.path;
    this.rotationDays = auditConfig.rotationDays;
  }

  /**
   * Generate a unique log entry ID.
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Sanitize arguments for logging.
   *
   * Removes or masks sensitive values like private keys.
   * Handles nested objects and arrays recursively.
   */
  private sanitizeArguments(
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      // Mask sensitive fields
      const sensitiveKeys = [
        'privateKey',
        'password',
        'secret',
        'key',
        'token',
        'auth',
        'credential',
        'apikey',
      ];
      const isSensitive = sensitiveKeys.some((sk) =>
        key.toLowerCase().includes(sk.toLowerCase())
      );

      if (isSensitive && typeof value === 'string') {
        sanitized[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        // Properly sanitize arrays
        sanitized[key] = value.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return this.sanitizeArguments(item as Record<string, unknown>);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeArguments(
          value as Record<string, unknown>
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Ensure the log directory exists.
   */
  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.logPath);
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.error('Failed to create audit log directory:', error);
      }
    }
  }

  /**
   * Rotate logs if the current log file is from a previous day.
   *
   * Renames the existing log file with a date suffix and cleans up old logs.
   */
  private async rotateLogsIfNeeded(): Promise<void> {
    try {
      const stats = await stat(this.logPath);
      const logDate = new Date(stats.mtime);
      const today = new Date();

      // Check if log file is from a previous day
      if (logDate.toDateString() !== today.toDateString()) {
        // Generate archive filename with date
        const dateStr = logDate.toISOString().split('T')[0];
        const ext = '.jsonl';
        const base = this.logPath.endsWith(ext)
          ? this.logPath.slice(0, -ext.length)
          : this.logPath;
        const archivePath = `${base}.${dateStr}${ext}`;

        // Rename current log to archive
        await rename(this.logPath, archivePath);

        // Clean up old logs
        await this.cleanupOldLogs();
      }
    } catch (error) {
      // File doesn't exist yet, that's fine - no rotation needed
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Log rotation error:', error);
      }
    }
  }

  /**
   * Clean up log files older than rotationDays.
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const dir = dirname(this.logPath);
      const currentFileName = basename(this.logPath);
      const baseNameWithoutExt = basename(this.logPath, '.jsonl');

      const files = await readdir(dir);
      const cutoffMs = Date.now() - this.rotationDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        // Skip the current log file
        if (file === currentFileName) continue;

        // Check if this is a rotated log file (e.g., audit.2024-12-10.jsonl)
        const dateMatch = file.match(
          new RegExp(`^${baseNameWithoutExt}\\.(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`)
        );

        if (dateMatch) {
          const fileDate = new Date(dateMatch[1]).getTime();

          // Delete if older than retention period
          if (fileDate < cutoffMs) {
            const filePath = join(dir, file);
            await unlink(filePath);
          }
        }
      }
    } catch (error) {
      // Non-fatal - just log and continue
      console.error('Failed to cleanup old audit logs:', error);
    }
  }

  /**
   * Add an entry to the in-memory recent logs.
   */
  private addToRecentLogs(entry: AuditLogEntry): void {
    this.recentLogs.push(entry);

    // Trim if over limit
    if (this.recentLogs.length > this.maxRecentLogs) {
      this.recentLogs = this.recentLogs.slice(-this.maxRecentLogs);
    }
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance */
let instance: AuditLogger | null = null;

/**
 * Get the singleton AuditLogger instance.
 */
export function getAuditLogger(): AuditLogger {
  if (!instance) {
    instance = new AuditLogger();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetAuditLogger(): void {
  if (instance) {
    instance.clearRecentLogs();
    // Close the logger to release file handles
    instance.close().catch(console.error);
  }
  instance = null;
}

/**
 * Concurrent Payroll Processing Module
 *
 * Executes payroll using Tempo's concurrent transactions feature.
 * Each payment uses a separate nonceKey for parallel execution,
 * resulting in 10-100x faster processing compared to sequential
 * batch payments.
 *
 * Performance comparison (50 employees):
 * - Sequential batch: ~150 seconds (one tx per employee)
 * - Concurrent payments: ~3 seconds (all in parallel)
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../../shared/client.js';
import type { PayrollEmployee } from '../../shared/types.js';

export interface ConcurrentPaymentItem {
  token: string;
  to: string;
  amount: string;
  memo?: string;
}

export interface ConcurrentPaymentResult {
  success: boolean;
  totalPayments: number;
  confirmedPayments: number;
  failedPayments: number;
  pendingPayments: number;
  transactions: Array<{
    nonceKey: number;
    transactionHash: string | null;
    to: string;
    amount: string;
    token: string;
    tokenSymbol: string;
    memo: string | null;
    status: 'confirmed' | 'pending' | 'failed';
    error?: string;
    explorerUrl?: string;
  }>;
  totalAmount: string;
  totalDuration: string;
  chunksProcessed?: number;
  timestamp: string;
}

export interface ProcessConcurrentResult {
  success: boolean;
  totalPayments: number;
  confirmedPayments: number;
  failedPayments: number;
  totalAmount?: string;
  duration?: string;
  transactions?: ConcurrentPaymentResult['transactions'];
  error?: string;
}

/**
 * Generate a memo for a payroll payment.
 *
 * Format: {PERIOD}-{EMPLOYEE_ID}
 * Example: DEC2024-EMP001
 *
 * @param employeeId - Employee ID
 * @param period - Optional period string (default: current month/year)
 * @returns Memo string (max 32 bytes)
 */
export function generatePayrollMemo(employeeId: string, period?: string): string {
  const periodStr =
    period ??
    new Date()
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      .replace(' ', '')
      .toUpperCase();

  const memo = `${periodStr}-${employeeId}`;

  // Ensure memo fits in 32 bytes
  const bytes = new TextEncoder().encode(memo);
  if (bytes.length > 32) {
    return memo.slice(0, 32);
  }

  return memo;
}

/**
 * Process payroll using concurrent transactions.
 *
 * This uses Tempo's nonceKey feature to execute all payments in parallel,
 * dramatically reducing processing time for large payrolls.
 *
 * @param client - MCP client
 * @param employees - Employees to pay
 * @param token - Token to pay in (e.g., "AlphaUSD")
 * @param period - Optional period for memo (e.g., "DEC2024")
 * @param startNonceKey - Starting nonce key (default: 1, reserving 0 for other operations)
 * @returns Processing result
 *
 * @example
 * ```typescript
 * const result = await processPayrollConcurrent(
 *   client,
 *   employees,
 *   'AlphaUSD',
 *   'DEC2024'
 * );
 *
 * console.log(`Processed ${result.confirmedPayments}/${result.totalPayments} payments`);
 * console.log(`Duration: ${result.duration}`);
 * ```
 */
export async function processPayrollConcurrent(
  client: Client,
  employees: PayrollEmployee[],
  token: string,
  period?: string,
  startNonceKey: number = 1
): Promise<ProcessConcurrentResult> {
  try {
    // Validate employee count doesn't exceed nonce key range
    if (employees.length > 256 - startNonceKey) {
      return {
        success: false,
        totalPayments: employees.length,
        confirmedPayments: 0,
        failedPayments: 0,
        error: `Cannot process ${employees.length} employees starting at key ${startNonceKey}. Max ${256 - startNonceKey} available.`,
      };
    }

    // Build concurrent payment items with memos
    const payments: ConcurrentPaymentItem[] = employees.map((emp) => ({
      token,
      to: emp.walletAddress,
      amount: emp.amount,
      memo: generatePayrollMemo(emp.employeeId, period),
    }));

    console.log(`Processing ${payments.length} payroll payments concurrently...`);
    console.log(`Using nonce keys ${startNonceKey} to ${startNonceKey + payments.length - 1}`);

    // Execute concurrent payments
    const result = await callTool<ConcurrentPaymentResult>(
      client,
      'send_concurrent_payments',
      {
        payments,
        startNonceKey,
        waitForConfirmation: true,
      }
    );

    if (!result.success) {
      // Partial success - some payments may have failed
      console.log(`Warning: ${result.failedPayments} payments failed`);
    }

    return {
      success: result.success,
      totalPayments: result.totalPayments,
      confirmedPayments: result.confirmedPayments,
      failedPayments: result.failedPayments,
      totalAmount: result.totalAmount,
      duration: result.totalDuration,
      transactions: result.transactions,
    };
  } catch (error) {
    return {
      success: false,
      totalPayments: employees.length,
      confirmedPayments: 0,
      failedPayments: employees.length,
      error: (error as Error).message,
    };
  }
}

/**
 * Format concurrent payroll results for display.
 *
 * @param result - Processing result
 * @param employees - Employees that were paid
 * @returns Formatted result lines
 */
export function formatConcurrentPayrollResult(
  result: ProcessConcurrentResult,
  employees: PayrollEmployee[]
): string[] {
  const lines: string[] = [];

  if (!result.success && result.error) {
    return [`Error: ${result.error}`];
  }

  lines.push('=== CONCURRENT PAYROLL RESULTS ===');
  lines.push('');
  lines.push(`Total Payments: ${result.totalPayments}`);
  lines.push(`Confirmed: ${result.confirmedPayments}`);
  lines.push(`Failed: ${result.failedPayments}`);
  lines.push(`Total Amount: ${result.totalAmount}`);
  lines.push(`Processing Time: ${result.duration}`);
  lines.push('');

  if (result.transactions) {
    lines.push('--- Transaction Details ---');
    for (let i = 0; i < result.transactions.length; i++) {
      const tx = result.transactions[i];
      const emp = employees[i];
      const status = tx.status === 'confirmed' ? '✓' : tx.status === 'pending' ? '⏳' : '✗';

      lines.push(`${status} ${emp.name} (${emp.employeeId})`);
      lines.push(`  Amount: ${tx.amount} ${tx.tokenSymbol}`);
      lines.push(`  NonceKey: ${tx.nonceKey}`);

      if (tx.transactionHash) {
        lines.push(`  Tx: ${tx.transactionHash.slice(0, 18)}...`);
      }
      if (tx.error) {
        lines.push(`  Error: ${tx.error}`);
      }
    }
  }

  return lines;
}

/**
 * Estimate concurrent payroll processing time.
 *
 * Concurrent payments are ~50-100x faster than sequential for large batches.
 *
 * @param employeeCount - Number of employees
 * @returns Estimated time in seconds
 */
export function estimateConcurrentProcessingTime(employeeCount: number): {
  concurrent: number;
  sequential: number;
  speedup: string;
} {
  // Assumptions based on Tempo testnet:
  // - Sequential: ~3 seconds per transaction
  // - Concurrent: ~3 seconds total for up to 50 payments
  // - Chunking adds ~0.5s per chunk

  const chunkSize = 50;
  const chunkDelay = 0.5; // seconds
  const baseTime = 3; // seconds

  const chunks = Math.ceil(employeeCount / chunkSize);
  const concurrentTime = baseTime + (chunks - 1) * chunkDelay;
  const sequentialTime = employeeCount * baseTime;

  const speedup = (sequentialTime / concurrentTime).toFixed(1);

  return {
    concurrent: concurrentTime,
    sequential: sequentialTime,
    speedup: `${speedup}x faster`,
  };
}

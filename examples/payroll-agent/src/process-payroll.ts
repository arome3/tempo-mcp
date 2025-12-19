/**
 * Payroll Processing Module
 *
 * Executes batch payments for payroll.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../../shared/client.js';
import type {
  PayrollEmployee,
  BatchPaymentResult,
  BatchPaymentItem,
} from '../../shared/types.js';

export interface ProcessResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  totalAmount?: string;
  recipientCount?: number;
  gasCost?: string;
  explorerUrl?: string;
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
export function generateMemo(employeeId: string, period?: string): string {
  const periodStr =
    period ??
    new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      .replace(' ', '')
      .toUpperCase();

  const memo = `${periodStr}-${employeeId}`;

  // Ensure memo fits in 32 bytes
  const bytes = new TextEncoder().encode(memo);
  if (bytes.length > 32) {
    // Truncate employee ID if needed
    return memo.slice(0, 32);
  }

  return memo;
}

/**
 * Process payroll batch payment.
 *
 * @param client - MCP client
 * @param employees - Employees to pay
 * @param token - Token to pay in
 * @param period - Optional period for memo
 * @returns Processing result
 */
export async function processPayroll(
  client: Client,
  employees: PayrollEmployee[],
  token: string,
  period?: string
): Promise<ProcessResult> {
  try {
    // Build batch payment items
    const payments: BatchPaymentItem[] = employees.map((emp) => ({
      to: emp.walletAddress,
      amount: emp.amount,
      memo: generateMemo(emp.employeeId, period),
      label: emp.name,
    }));

    // Execute batch payment
    const result = await callTool<BatchPaymentResult>(
      client,
      'batch_payments',
      {
        token,
        payments,
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message ?? 'Unknown error',
      };
    }

    return {
      success: true,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      totalAmount: result.totalAmount,
      recipientCount: result.recipientCount,
      gasCost: result.gasCost,
      explorerUrl: result.explorerUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Format payroll results for display.
 *
 * @param result - Processing result
 * @param employees - Employees that were paid
 * @returns Formatted result lines
 */
export function formatPayrollResult(
  result: ProcessResult,
  employees: PayrollEmployee[]
): string[] {
  if (!result.success) {
    return [`Error: ${result.error}`];
  }

  return [
    `Transaction: ${result.transactionHash}`,
    `Block: ${result.blockNumber}`,
    `Total Paid: ${result.totalAmount}`,
    `Recipients: ${result.recipientCount}`,
    `Gas Cost: ${result.gasCost}`,
    '',
    `Explorer: ${result.explorerUrl}`,
  ];
}

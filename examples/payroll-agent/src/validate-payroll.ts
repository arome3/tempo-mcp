/**
 * Payroll Validation Module
 *
 * Pre-flight checks before processing payroll.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../../shared/client.js';
import type { BalanceResult, PayrollEmployee } from '../../shared/types.js';
import { calculateTotal } from './parse-csv.js';

export interface ValidationResult {
  valid: boolean;
  walletAddress: string;
  currentBalance: string;
  totalPayroll: string;
  balanceAfter: string;
  employeeCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Validate payroll before processing.
 *
 * Checks:
 * - Wallet has sufficient balance
 * - All addresses are unique
 * - No duplicate employee IDs
 *
 * @param client - MCP client
 * @param employees - Employees to pay
 * @param token - Token to pay in
 * @returns Validation result
 */
export async function validatePayroll(
  client: Client,
  employees: PayrollEmployee[],
  token: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get current balance
  const balance = await callTool<BalanceResult>(client, 'get_balance', {
    token,
  });

  const currentBalance = parseFloat(balance.balance);
  const totalPayroll = parseFloat(calculateTotal(employees));
  const balanceAfter = currentBalance - totalPayroll;

  // Check sufficient balance
  if (balanceAfter < 0) {
    errors.push(
      `Insufficient balance: have ${balance.balance}, need ${totalPayroll.toFixed(2)} ${token}`
    );
  }

  // Check for duplicate employee IDs
  const employeeIds = employees.map((e) => e.employeeId);
  const duplicateIds = employeeIds.filter(
    (id, index) => employeeIds.indexOf(id) !== index
  );
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate employee IDs: ${Array.from(new Set(duplicateIds)).join(', ')}`);
  }

  // Check for duplicate addresses
  const addresses = employees.map((e) => e.walletAddress.toLowerCase());
  const duplicateAddresses = addresses.filter(
    (addr, index) => addresses.indexOf(addr) !== index
  );
  if (duplicateAddresses.length > 0) {
    warnings.push(
      `Multiple payments to same address: ${Array.from(new Set(duplicateAddresses)).length} address(es)`
    );
  }

  // Check batch size
  if (employees.length > 100) {
    errors.push(
      `Batch size exceeds maximum: ${employees.length} employees (max 100)`
    );
  }

  // Warn if balance will be low
  if (balanceAfter >= 0 && balanceAfter < totalPayroll * 0.1) {
    warnings.push(
      `Low balance after payroll: ${balanceAfter.toFixed(2)} ${token} remaining`
    );
  }

  return {
    valid: errors.length === 0,
    walletAddress: balance.address,
    currentBalance: balance.balance,
    totalPayroll: totalPayroll.toFixed(2),
    balanceAfter: balanceAfter.toFixed(2),
    employeeCount: employees.length,
    errors,
    warnings,
  };
}

/**
 * Generate a summary table of payroll by department.
 *
 * @param employees - All employees
 * @returns Department summary
 */
export function getDepartmentSummary(
  employees: PayrollEmployee[]
): Array<{ department: string; count: number; total: string }> {
  const byDept = new Map<string, { count: number; total: number }>();

  for (const emp of employees) {
    const dept = emp.department ?? 'Unassigned';
    const current = byDept.get(dept) ?? { count: 0, total: 0 };
    current.count++;
    current.total += parseFloat(emp.amount);
    byDept.set(dept, current);
  }

  return Array.from(byDept.entries())
    .map(([department, data]) => ({
      department,
      count: data.count,
      total: data.total.toFixed(2),
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
}

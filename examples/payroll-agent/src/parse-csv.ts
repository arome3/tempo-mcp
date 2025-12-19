/**
 * CSV Parsing Module
 *
 * Parses payroll CSV files and validates data format.
 */

import { readFileSync } from 'fs';
import { parseCSV, isValidAddress, isValidAmount } from '../../shared/utils.js';
import type { PayrollEmployee } from '../../shared/types.js';

export interface ParseResult {
  employees: PayrollEmployee[];
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value: string;
  }>;
}

/**
 * Required CSV columns
 */
const REQUIRED_COLUMNS = ['employee_id', 'name', 'wallet_address', 'amount'];

/**
 * Parse a payroll CSV file.
 *
 * @param filePath - Path to CSV file
 * @returns Parsed employees and any errors
 */
export function parsePayrollCSV(filePath: string): ParseResult {
  const content = readFileSync(filePath, 'utf-8');
  const { headers, rows } = parseCSV(content, true);

  if (!headers) {
    return {
      employees: [],
      errors: [
        {
          row: 0,
          field: 'headers',
          message: 'CSV file is empty or has no headers',
          value: '',
        },
      ],
    };
  }

  // Validate required columns
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col)
  );
  if (missingColumns.length > 0) {
    return {
      employees: [],
      errors: [
        {
          row: 0,
          field: 'headers',
          message: `Missing required columns: ${missingColumns.join(', ')}`,
          value: headers.join(', '),
        },
      ],
    };
  }

  // Map column indices
  const colIndex = {
    employeeId: headers.indexOf('employee_id'),
    name: headers.indexOf('name'),
    walletAddress: headers.indexOf('wallet_address'),
    amount: headers.indexOf('amount'),
    department: headers.indexOf('department'),
  };

  const employees: PayrollEmployee[] = [];
  const errors: ParseResult['errors'] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-indexed, skip header
    const employeeId = row[colIndex.employeeId]?.trim() ?? '';
    const name = row[colIndex.name]?.trim() ?? '';
    const walletAddress = row[colIndex.walletAddress]?.trim() ?? '';
    const amount = row[colIndex.amount]?.trim() ?? '';
    const department =
      colIndex.department >= 0 ? row[colIndex.department]?.trim() : undefined;

    // Validate employee ID
    if (!employeeId) {
      errors.push({
        row: rowNum,
        field: 'employee_id',
        message: 'Employee ID is required',
        value: employeeId,
      });
    }

    // Validate name
    if (!name) {
      errors.push({
        row: rowNum,
        field: 'name',
        message: 'Name is required',
        value: name,
      });
    }

    // Validate wallet address
    if (!walletAddress) {
      errors.push({
        row: rowNum,
        field: 'wallet_address',
        message: 'Wallet address is required',
        value: walletAddress,
      });
    } else if (!isValidAddress(walletAddress)) {
      errors.push({
        row: rowNum,
        field: 'wallet_address',
        message: 'Invalid wallet address format',
        value: walletAddress,
      });
    }

    // Validate amount
    if (!amount) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: 'Amount is required',
        value: amount,
      });
    } else if (!isValidAmount(amount)) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: 'Invalid amount (must be positive number)',
        value: amount,
      });
    }

    // Add valid employee (even if some fields have errors, for reporting)
    if (employeeId && name && isValidAddress(walletAddress) && isValidAmount(amount)) {
      employees.push({
        employeeId,
        name,
        walletAddress,
        amount,
        department,
      });
    }
  });

  return { employees, errors };
}

/**
 * Filter employees by department.
 *
 * @param employees - All employees
 * @param department - Department to filter by
 * @returns Filtered employees
 */
export function filterByDepartment(
  employees: PayrollEmployee[],
  department: string
): PayrollEmployee[] {
  return employees.filter(
    (e) => e.department?.toLowerCase() === department.toLowerCase()
  );
}

/**
 * Calculate total payroll amount.
 *
 * @param employees - List of employees
 * @returns Total amount as string
 */
export function calculateTotal(employees: PayrollEmployee[]): string {
  const total = employees.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  return total.toFixed(2);
}

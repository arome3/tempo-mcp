/**
 * Shared Utilities
 *
 * Common helper functions for validation, formatting, and display.
 */

import * as readline from 'readline';

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate an Ethereum address format.
 *
 * @param address - Address to validate
 * @returns True if valid 0x-prefixed 40-char hex address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate an amount string (positive number).
 *
 * @param amount - Amount string to validate
 * @returns True if valid positive number
 */
export function isValidAmount(amount: string): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

/**
 * Validate a transaction hash format.
 *
 * @param hash - Transaction hash to validate
 * @returns True if valid 0x-prefixed 64-char hex hash
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate a memo (max 32 bytes UTF-8).
 *
 * @param memo - Memo to validate
 * @returns True if valid length
 */
export function isValidMemo(memo: string): boolean {
  const bytes = new TextEncoder().encode(memo);
  return bytes.length <= 32;
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format an amount with commas and fixed decimals.
 *
 * @param amount - Amount string or number
 * @param decimals - Decimal places (default 2)
 * @returns Formatted string (e.g., "1,234.56")
 */
export function formatAmount(
  amount: string | number,
  decimals: number = 2
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a percentage.
 *
 * @param value - Percentage value (0-100)
 * @param decimals - Decimal places (default 1)
 * @returns Formatted string (e.g., "45.5%")
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Truncate an address for display.
 *
 * @param address - Full address
 * @param chars - Characters to show on each side (default 4)
 * @returns Truncated address (e.g., "0x742d...bEbb")
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 4) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a date for display.
 *
 * @param date - Date string or Date object
 * @returns Formatted date string
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with time.
 *
 * @param date - Date string or Date object
 * @returns Formatted datetime string
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// =============================================================================
// Console Output
// =============================================================================

/**
 * Print a table to the console.
 *
 * @param headers - Column headers
 * @param rows - Data rows
 */
export function printTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length))
  );

  // Print header
  const headerRow = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join(' | ');
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');

  console.log(headerRow);
  console.log(separator);

  // Print rows
  for (const row of rows) {
    const formattedRow = row
      .map((cell, i) => (cell || '').padEnd(widths[i]))
      .join(' | ');
    console.log(formattedRow);
  }
}

/**
 * Print a success message.
 *
 * @param message - Message to print
 */
export function printSuccess(message: string): void {
  console.log(`\n✅ ${message}`);
}

/**
 * Print an error message.
 *
 * @param message - Message to print
 */
export function printError(message: string): void {
  console.error(`\n❌ ${message}`);
}

/**
 * Print a warning message.
 *
 * @param message - Message to print
 */
export function printWarning(message: string): void {
  console.log(`\n⚠️  ${message}`);
}

/**
 * Print an info message.
 *
 * @param message - Message to print
 */
export function printInfo(message: string): void {
  console.log(`\nℹ️  ${message}`);
}

/**
 * Print a section header.
 *
 * @param title - Section title
 */
export function printHeader(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

/**
 * Print a divider line.
 */
export function printDivider(): void {
  console.log('-'.repeat(60));
}

// =============================================================================
// User Input
// =============================================================================

/**
 * Prompt user for confirmation.
 *
 * @param message - Confirmation message
 * @returns True if user confirms
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt user for input.
 *
 * @param prompt - Prompt message
 * @returns User input
 */
export async function promptInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${prompt}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// =============================================================================
// CSV Parsing
// =============================================================================

/**
 * Parse a CSV string into rows.
 *
 * @param csv - CSV content
 * @param hasHeader - Whether first row is header (default true)
 * @returns Parsed rows with optional headers
 */
export function parseCSV(
  csv: string,
  hasHeader: boolean = true
): { headers: string[] | null; rows: string[][] } {
  const lines = csv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: null, rows: [] };
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  if (hasHeader) {
    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  }

  return { headers: null, rows: lines.map(parseRow) };
}

// =============================================================================
// Date Utilities
// =============================================================================

/**
 * Get ISO timestamp for a future date.
 *
 * @param daysFromNow - Number of days in the future
 * @param hour - Hour of day (0-23, default 9)
 * @returns ISO 8601 timestamp
 */
export function getFutureDate(daysFromNow: number, hour: number = 9): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Check if a date is in the past.
 *
 * @param date - Date to check
 * @returns True if date is in the past
 */
export function isPast(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() < Date.now();
}

/**
 * Check if a date is within N days.
 *
 * @param date - Date to check
 * @param days - Number of days
 * @returns True if date is within N days
 */
export function isWithinDays(date: string | Date, days: number): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);
  return d >= now && d <= future;
}

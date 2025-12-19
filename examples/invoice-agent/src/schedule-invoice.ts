/**
 * Schedule Invoice Payment
 *
 * Schedule a payment for an invoice's due date.
 *
 * Usage:
 *   npx tsx src/schedule-invoice.ts <invoice-id>
 *   npx tsx src/schedule-invoice.ts INV-2024-0043
 *   npx tsx src/schedule-invoice.ts INV-2024-0043 --date 2024-12-20T09:00:00Z
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { BalanceResult, SchedulePaymentResult, Invoice } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  formatAmount,
  formatDate,
  formatDateTime,
  truncateAddress,
  confirm,
  isPast,
} from '../../shared/utils.js';

interface InvoiceFile {
  invoices: Invoice[];
}

function loadInvoices(filePath: string): InvoiceFile {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as InvoiceFile;
}

function saveInvoices(filePath: string, data: InvoiceFile): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Convert a date to execution timestamp (9:00 AM UTC on that date).
 */
function getExecutionTime(dateStr: string): string {
  const date = new Date(dateStr);
  date.setUTCHours(9, 0, 0, 0);
  return date.toISOString();
}

function printUsage() {
  console.log('Usage: npx tsx src/schedule-invoice.ts <invoice-id> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --file <path>    Invoice JSON file (default: data/sample-invoices.json)');
  console.log('  --date <iso>     Custom execution date/time (default: due date 9:00 AM UTC)');
  console.log('  --token <sym>    Token to pay in (default: from invoice)');
  console.log('  --help           Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/schedule-invoice.ts INV-2024-0043');
  console.log('  npx tsx src/schedule-invoice.ts INV-2024-0043 --date 2024-12-20T14:00:00Z');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  let invoiceId = '';
  let filePath = resolve(process.cwd(), 'data/sample-invoices.json');
  let customDate: string | undefined;
  let tokenOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      filePath = resolve(process.cwd(), args[++i]);
    } else if (arg === '--date' || arg === '-d') {
      customDate = args[++i];
    } else if (arg === '--token' || arg === '-t') {
      tokenOverride = args[++i];
    } else if (!arg.startsWith('-')) {
      invoiceId = arg;
    }
  }

  if (!invoiceId) {
    printError('Invoice ID is required');
    printUsage();
    process.exit(1);
  }

  printHeader('Tempo Invoice Scheduling');

  // Load invoices
  printInfo('Loading invoices...');
  const data = loadInvoices(filePath);
  const invoice = data.invoices.find((inv) => inv.id === invoiceId);

  if (!invoice) {
    printError(`Invoice not found: ${invoiceId}`);
    process.exit(1);
  }

  if (invoice.status === 'paid') {
    printWarning(`Invoice ${invoiceId} is already paid`);
    process.exit(0);
  }

  if (invoice.status === 'scheduled') {
    printWarning(`Invoice ${invoiceId} is already scheduled`);
    process.exit(0);
  }

  const token = tokenOverride ?? invoice.currency ?? 'AlphaUSD';
  const executeAt = customDate ?? getExecutionTime(invoice.dueDate);

  // Validate execution time is in the future
  if (isPast(executeAt)) {
    printError('Execution time must be in the future');
    console.log(`Specified: ${formatDateTime(executeAt)}`);
    console.log('Use --date to specify a future date/time');
    process.exit(1);
  }

  // Display invoice and schedule details
  console.log('\nInvoice Details:');
  printTable(
    ['Field', 'Value'],
    [
      ['Invoice ID', invoice.id],
      ['Vendor', invoice.vendor],
      ['Address', truncateAddress(invoice.vendorAddress)],
      ['Amount', `${formatAmount(invoice.amount)} ${token}`],
      ['Due Date', formatDate(invoice.dueDate)],
      ['Execute At', formatDateTime(executeAt)],
    ]
  );

  // Connect and validate
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    // Check current balance (informational)
    const balance = await callTool<BalanceResult>(client, 'get_balance', {
      token,
    });

    console.log(`\nCurrent Balance: ${formatAmount(balance.balance)} ${token}`);
    printInfo('Scheduled payments execute if sufficient balance at execution time');

    // Confirm
    const shouldProceed = await confirm(
      `\nSchedule payment for ${formatDateTime(executeAt)}?`
    );
    if (!shouldProceed) {
      printInfo('Scheduling cancelled');
      process.exit(0);
    }

    // Schedule payment
    printInfo('Scheduling payment...');
    const result = await callTool<SchedulePaymentResult>(
      client,
      'schedule_payment',
      {
        token,
        to: invoice.vendorAddress,
        amount: invoice.amount,
        memo: invoice.id,
        executeAt,
      }
    );

    if (!result.success) {
      printError(`Scheduling failed: ${result.error?.message}`);
      process.exit(1);
    }

    // Update invoice status
    invoice.status = 'scheduled';
    saveInvoices(filePath, data);

    printSuccess('Payment scheduled successfully!');
    printTable(
      ['Field', 'Value'],
      [
        ['Schedule ID', result.scheduleId ?? 'N/A'],
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Amount', `${result.amount} ${result.tokenSymbol}`],
        ['Execute At', formatDateTime(result.executeAt ?? executeAt)],
        ['Status', result.status ?? 'scheduled'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }

    printInfo(`Invoice ${invoice.id} marked as scheduled`);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

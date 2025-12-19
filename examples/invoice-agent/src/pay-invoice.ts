/**
 * Pay Invoice Script
 *
 * Pay a single invoice with memo for reconciliation.
 *
 * Usage:
 *   npx tsx src/pay-invoice.ts <invoice-id>
 *   npx tsx src/pay-invoice.ts INV-2024-0042
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { BalanceResult, PaymentResult, Invoice } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  formatAmount,
  formatDate,
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

function printUsage() {
  console.log('Usage: npx tsx src/pay-invoice.ts <invoice-id> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --file <path>  Invoice JSON file (default: data/sample-invoices.json)');
  console.log('  --token <sym>  Token to pay in (default: from invoice or AlphaUSD)');
  console.log('  --help         Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/pay-invoice.ts INV-2024-0042');
  console.log('  npx tsx src/pay-invoice.ts INV-2024-0042 --file invoices.json');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  let invoiceId = '';
  let filePath = resolve(process.cwd(), 'data/sample-invoices.json');
  let tokenOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      filePath = resolve(process.cwd(), args[++i]);
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

  printHeader('Tempo Invoice Payment');

  // Load invoices
  printInfo('Loading invoices...');
  const data = loadInvoices(filePath);
  const invoice = data.invoices.find((inv) => inv.id === invoiceId);

  if (!invoice) {
    printError(`Invoice not found: ${invoiceId}`);
    console.log('\nAvailable invoices:');
    for (const inv of data.invoices) {
      console.log(`  ${inv.id} - ${inv.vendor} (${inv.status})`);
    }
    process.exit(1);
  }

  if (invoice.status === 'paid') {
    printWarning(`Invoice ${invoiceId} is already paid`);
    console.log(`Transaction: ${invoice.paidTxHash}`);
    process.exit(0);
  }

  const token = tokenOverride ?? invoice.currency ?? 'AlphaUSD';

  // Display invoice
  console.log('\nInvoice Details:');
  printTable(
    ['Field', 'Value'],
    [
      ['Invoice ID', invoice.id],
      ['Vendor', invoice.vendor],
      ['Address', truncateAddress(invoice.vendorAddress)],
      ['Amount', `${formatAmount(invoice.amount)} ${token}`],
      ['Due Date', formatDate(invoice.dueDate)],
      ['Status', invoice.status.toUpperCase()],
    ]
  );

  if (isPast(invoice.dueDate)) {
    printWarning('This invoice is OVERDUE');
  }

  // Connect and check balance
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    const balance = await callTool<BalanceResult>(client, 'get_balance', {
      token,
    });

    const balanceNum = parseFloat(balance.balance);
    const amountNum = parseFloat(invoice.amount);

    if (balanceNum < amountNum) {
      printError(
        `Insufficient balance: ${formatAmount(balance.balance)} ${token}`
      );
      console.log(`Required: ${formatAmount(invoice.amount)} ${token}`);
      process.exit(1);
    }

    console.log(`\nWallet Balance: ${formatAmount(balance.balance)} ${token}`);
    console.log(`Balance After: ~${formatAmount(balanceNum - amountNum)} ${token}`);

    // Confirm payment
    const shouldProceed = await confirm('\nPay this invoice?');
    if (!shouldProceed) {
      printInfo('Payment cancelled');
      process.exit(0);
    }

    // Send payment with invoice ID as memo
    printInfo('Sending payment...');
    const result = await callTool<PaymentResult>(client, 'send_payment', {
      token,
      to: invoice.vendorAddress,
      amount: invoice.amount,
      memo: invoice.id,
    });

    if (!result.success) {
      printError(`Payment failed: ${result.error?.message}`);
      process.exit(1);
    }

    // Update invoice status
    invoice.status = 'paid';
    invoice.paidTxHash = result.transactionHash;
    saveInvoices(filePath, data);

    printSuccess('Invoice paid successfully!');
    printTable(
      ['Field', 'Value'],
      [
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Amount', `${result.amount} ${result.tokenSymbol}`],
        ['Memo', result.memo ?? invoice.id],
        ['Gas Cost', result.gasCost ?? 'N/A'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }

    printInfo(`Invoice ${invoice.id} marked as paid`);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

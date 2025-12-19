/**
 * Invoice Reconciliation
 *
 * Match on-chain transactions to invoices using memo field.
 *
 * Usage:
 *   npx tsx src/reconcile.ts
 *   npx tsx src/reconcile.ts --file invoices.json
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type { TransactionResult, Invoice } from '../../shared/types.js';
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
  isValidTxHash,
} from '../../shared/utils.js';

interface InvoiceFile {
  invoices: Invoice[];
}

interface ReconciliationResult {
  invoice: Invoice;
  transaction?: TransactionResult;
  status: 'matched' | 'unmatched' | 'error';
  error?: string;
}

function loadInvoices(filePath: string): InvoiceFile {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as InvoiceFile;
}

function printUsage() {
  console.log('Usage: npx tsx src/reconcile.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --file <path>   Invoice JSON file (default: data/sample-invoices.json)');
  console.log('  --status <s>    Filter by status (pending, paid, scheduled)');
  console.log('  --help          Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/reconcile.ts');
  console.log('  npx tsx src/reconcile.ts --status paid');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let filePath = resolve(process.cwd(), 'data/sample-invoices.json');
  let statusFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      filePath = resolve(process.cwd(), args[++i]);
    } else if (arg === '--status' || arg === '-s') {
      statusFilter = args[++i];
    }
  }

  printHeader('Tempo Invoice Reconciliation');

  // Load invoices
  printInfo('Loading invoices...');
  const data = loadInvoices(filePath);

  let invoices = data.invoices;
  if (statusFilter) {
    invoices = invoices.filter((inv) => inv.status === statusFilter);
  }

  if (invoices.length === 0) {
    printWarning('No invoices to reconcile');
    process.exit(0);
  }

  console.log(`\nFound ${invoices.length} invoice(s) to reconcile\n`);

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  const results: ReconciliationResult[] = [];

  try {
    // Check each paid invoice
    for (const invoice of invoices) {
      if (invoice.status === 'paid' && invoice.paidTxHash) {
        // Verify transaction exists and matches
        if (!isValidTxHash(invoice.paidTxHash)) {
          results.push({
            invoice,
            status: 'error',
            error: 'Invalid transaction hash',
          });
          continue;
        }

        try {
          const tx = await callTool<TransactionResult>(
            client,
            'get_transaction',
            { hash: invoice.paidTxHash }
          );

          // Check if memo matches invoice ID
          const memoMatches =
            tx.memoDecoded === invoice.id || tx.memo === invoice.id;
          const amountMatches =
            tx.token?.amount === invoice.amount ||
            parseFloat(tx.token?.amount ?? '0') ===
              parseFloat(invoice.amount);
          const addressMatches =
            tx.to?.toLowerCase() === invoice.vendorAddress.toLowerCase();

          if (memoMatches && amountMatches && addressMatches) {
            results.push({
              invoice,
              transaction: tx,
              status: 'matched',
            });
          } else {
            const mismatches: string[] = [];
            if (!memoMatches) mismatches.push('memo');
            if (!amountMatches) mismatches.push('amount');
            if (!addressMatches) mismatches.push('address');

            results.push({
              invoice,
              transaction: tx,
              status: 'unmatched',
              error: `Mismatch: ${mismatches.join(', ')}`,
            });
          }
        } catch (error) {
          results.push({
            invoice,
            status: 'error',
            error: (error as Error).message,
          });
        }
      } else if (invoice.status === 'pending') {
        results.push({
          invoice,
          status: 'unmatched',
          error: 'Not yet paid',
        });
      } else if (invoice.status === 'scheduled') {
        results.push({
          invoice,
          status: 'unmatched',
          error: 'Scheduled (not executed)',
        });
      }
    }

    // Display results
    printHeader('Reconciliation Results');

    const matched = results.filter((r) => r.status === 'matched');
    const unmatched = results.filter((r) => r.status === 'unmatched');
    const errors = results.filter((r) => r.status === 'error');

    if (matched.length > 0) {
      console.log('\nMatched Invoices:');
      printTable(
        ['Invoice', 'Vendor', 'Amount', 'Tx Hash', 'Status'],
        matched.map((r) => [
          r.invoice.id,
          r.invoice.vendor,
          formatAmount(r.invoice.amount),
          truncateAddress(r.transaction?.hash ?? '', 8),
          r.transaction?.status?.toUpperCase() ?? 'N/A',
        ])
      );
    }

    if (unmatched.length > 0) {
      console.log('\nUnmatched Invoices:');
      printTable(
        ['Invoice', 'Vendor', 'Amount', 'Due Date', 'Reason'],
        unmatched.map((r) => [
          r.invoice.id,
          r.invoice.vendor,
          formatAmount(r.invoice.amount),
          formatDate(r.invoice.dueDate),
          r.error ?? 'Unknown',
        ])
      );
    }

    if (errors.length > 0) {
      console.log('\nErrors:');
      printTable(
        ['Invoice', 'Vendor', 'Error'],
        errors.map((r) => [r.invoice.id, r.invoice.vendor, r.error ?? 'Unknown'])
      );
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  Matched:   ${matched.length}`);
    console.log(`  Unmatched: ${unmatched.length}`);
    console.log(`  Errors:    ${errors.length}`);

    const totalMatched = matched.reduce(
      (sum, r) => sum + parseFloat(r.invoice.amount),
      0
    );
    const totalUnmatched = unmatched.reduce(
      (sum, r) => sum + parseFloat(r.invoice.amount),
      0
    );

    console.log('');
    console.log(`  Matched Amount:   ${formatAmount(totalMatched)}`);
    console.log(`  Unmatched Amount: ${formatAmount(totalUnmatched)}`);

    if (errors.length === 0 && unmatched.length === 0) {
      printSuccess('All invoices reconciled successfully!');
    } else if (errors.length > 0) {
      printWarning('Some invoices could not be reconciled');
    } else {
      printInfo('Reconciliation complete with pending items');
    }
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

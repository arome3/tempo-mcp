/**
 * Invoice Agent
 *
 * Invoice management CLI for accounts payable automation.
 *
 * Usage:
 *   npx tsx src/index.ts                          # List invoices
 *   npx tsx src/index.ts --due-soon               # Show invoices due within 7 days
 *   npx tsx src/index.ts --pay-all-due            # Pay all due invoices
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createTempoClient, callTool, disconnect } from '../../shared/client.js';
import type {
  BalanceResult,
  PaymentResult,
  BatchPaymentResult,
  Invoice,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  printDivider,
  formatAmount,
  formatDate,
  truncateAddress,
  confirm,
  isPast,
  isWithinDays,
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
  console.log('Usage: npx tsx src/index.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --file <path>     Invoice JSON file (default: data/sample-invoices.json)');
  console.log('  --due-soon        Show invoices due within 7 days');
  console.log('  --overdue         Show overdue invoices');
  console.log('  --pay-all-due     Pay all overdue and due-today invoices');
  console.log('  --token <sym>     Token to pay in (default: AlphaUSD)');
  console.log('  --help            Show this help');
  console.log('');
  console.log('Individual Invoice Commands:');
  console.log('  npx tsx src/pay-invoice.ts <invoice-id>');
  console.log('  npx tsx src/schedule-invoice.ts <invoice-id>');
  console.log('  npx tsx src/reconcile.ts');
}

interface CliArgs {
  filePath: string;
  dueSoon: boolean;
  overdue: boolean;
  payAllDue: boolean;
  token: string;
}

function parseArgs(): CliArgs | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  let filePath = resolve(process.cwd(), 'data/sample-invoices.json');
  let dueSoon = false;
  let overdue = false;
  let payAllDue = false;
  let token = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      filePath = resolve(process.cwd(), args[++i]);
    } else if (arg === '--due-soon') {
      dueSoon = true;
    } else if (arg === '--overdue') {
      overdue = true;
    } else if (arg === '--pay-all-due') {
      payAllDue = true;
    } else if (arg === '--token' || arg === '-t') {
      token = args[++i];
    }
  }

  return { filePath, dueSoon, overdue, payAllDue, token };
}

function categorizeInvoices(invoices: Invoice[]): {
  pending: Invoice[];
  overdue: Invoice[];
  dueSoon: Invoice[];
  paid: Invoice[];
  scheduled: Invoice[];
} {
  const pending: Invoice[] = [];
  const overdue: Invoice[] = [];
  const dueSoon: Invoice[] = [];
  const paid: Invoice[] = [];
  const scheduled: Invoice[] = [];

  for (const inv of invoices) {
    if (inv.status === 'paid') {
      paid.push(inv);
    } else if (inv.status === 'scheduled') {
      scheduled.push(inv);
    } else if (isPast(inv.dueDate)) {
      overdue.push(inv);
    } else if (isWithinDays(inv.dueDate, 7)) {
      dueSoon.push(inv);
    } else {
      pending.push(inv);
    }
  }

  return { pending, overdue, dueSoon, paid, scheduled };
}

async function main() {
  const args = parseArgs();
  if (!args) {
    process.exit(0);
  }

  printHeader('Tempo Invoice Agent');

  // Load invoices
  printInfo('Loading invoices...');
  const data = loadInvoices(args.filePath);
  const categories = categorizeInvoices(data.invoices);

  // Show summary
  console.log('\nInvoice Summary:');
  printTable(
    ['Status', 'Count', 'Total Amount'],
    [
      [
        'Overdue',
        categories.overdue.length.toString(),
        formatAmount(
          categories.overdue.reduce((s, i) => s + parseFloat(i.amount), 0)
        ),
      ],
      [
        'Due Soon (7 days)',
        categories.dueSoon.length.toString(),
        formatAmount(
          categories.dueSoon.reduce((s, i) => s + parseFloat(i.amount), 0)
        ),
      ],
      [
        'Pending',
        categories.pending.length.toString(),
        formatAmount(
          categories.pending.reduce((s, i) => s + parseFloat(i.amount), 0)
        ),
      ],
      [
        'Scheduled',
        categories.scheduled.length.toString(),
        formatAmount(
          categories.scheduled.reduce((s, i) => s + parseFloat(i.amount), 0)
        ),
      ],
      [
        'Paid',
        categories.paid.length.toString(),
        formatAmount(
          categories.paid.reduce((s, i) => s + parseFloat(i.amount), 0)
        ),
      ],
    ]
  );

  // Show overdue warning
  if (categories.overdue.length > 0) {
    printWarning(`${categories.overdue.length} invoice(s) are OVERDUE!`);
  }

  // Filter view based on flags
  let displayInvoices = data.invoices.filter((i) => i.status !== 'paid');

  if (args.overdue) {
    displayInvoices = categories.overdue;
    console.log('\nOverdue Invoices:');
  } else if (args.dueSoon) {
    displayInvoices = [...categories.overdue, ...categories.dueSoon];
    console.log('\nInvoices Due Soon:');
  } else {
    console.log('\nAll Unpaid Invoices:');
  }

  if (displayInvoices.length === 0) {
    printInfo('No invoices to display');
    return;
  }

  printTable(
    ['Invoice', 'Vendor', 'Amount', 'Due Date', 'Status'],
    displayInvoices.map((inv) => {
      let status = inv.status.toUpperCase();
      if (inv.status === 'pending' && isPast(inv.dueDate)) {
        status = 'OVERDUE';
      }
      return [
        inv.id,
        inv.vendor,
        formatAmount(inv.amount),
        formatDate(inv.dueDate),
        status,
      ];
    })
  );

  // Pay all due if requested
  if (args.payAllDue) {
    const toPay = [...categories.overdue, ...categories.dueSoon.filter(
      (inv) => isPast(inv.dueDate) || formatDate(inv.dueDate) === formatDate(new Date())
    )];

    if (toPay.length === 0) {
      printInfo('No invoices due today to pay');
      return;
    }

    printDivider();
    console.log(`\nInvoices to pay: ${toPay.length}`);
    const totalToPay = toPay.reduce((s, i) => s + parseFloat(i.amount), 0);
    console.log(`Total amount: ${formatAmount(totalToPay)} ${args.token}`);

    // Connect and check balance
    printInfo('Connecting to tempo-mcp server...');
    const client = await createTempoClient();

    try {
      const balance = await callTool<BalanceResult>(client, 'get_balance', {
        token: args.token,
      });

      const balanceNum = parseFloat(balance.balance);
      if (balanceNum < totalToPay) {
        printError(
          `Insufficient balance: ${formatAmount(balance.balance)} ${args.token}`
        );
        console.log(`Required: ${formatAmount(totalToPay)} ${args.token}`);
        return;
      }

      console.log(`\nWallet Balance: ${formatAmount(balance.balance)} ${args.token}`);
      console.log(`Balance After: ~${formatAmount(balanceNum - totalToPay)} ${args.token}`);

      const shouldProceed = await confirm(
        `\nPay ${toPay.length} invoice(s) totaling ${formatAmount(totalToPay)} ${args.token}?`
      );

      if (!shouldProceed) {
        printInfo('Payment cancelled');
        return;
      }

      // Use batch payment if multiple invoices
      if (toPay.length > 1) {
        printInfo('Processing batch payment...');
        const result = await callTool<BatchPaymentResult>(
          client,
          'batch_payments',
          {
            token: args.token,
            payments: toPay.map((inv) => ({
              to: inv.vendorAddress,
              amount: inv.amount,
              memo: inv.id,
              label: inv.vendor,
            })),
          }
        );

        if (!result.success) {
          printError(`Batch payment failed: ${result.error?.message}`);
          return;
        }

        // Update invoice statuses
        for (const inv of toPay) {
          inv.status = 'paid';
          inv.paidTxHash = result.transactionHash;
        }
        saveInvoices(args.filePath, data);

        printSuccess(`Paid ${toPay.length} invoices!`);
        console.log(`Transaction: ${result.transactionHash}`);
        console.log(`Total: ${result.totalAmount} ${result.tokenSymbol}`);
        if (result.explorerUrl) {
          console.log(`Explorer: ${result.explorerUrl}`);
        }
      } else {
        // Single payment
        const inv = toPay[0];
        printInfo('Processing payment...');
        const result = await callTool<PaymentResult>(client, 'send_payment', {
          token: args.token,
          to: inv.vendorAddress,
          amount: inv.amount,
          memo: inv.id,
        });

        if (!result.success) {
          printError(`Payment failed: ${result.error?.message}`);
          return;
        }

        inv.status = 'paid';
        inv.paidTxHash = result.transactionHash;
        saveInvoices(args.filePath, data);

        printSuccess(`Paid invoice ${inv.id}!`);
        console.log(`Transaction: ${result.transactionHash}`);
        if (result.explorerUrl) {
          console.log(`Explorer: ${result.explorerUrl}`);
        }
      }
    } finally {
      await disconnect(client);
    }
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

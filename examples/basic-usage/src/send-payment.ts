/**
 * Send Payment Script
 *
 * Standalone script to send a token payment.
 *
 * Usage:
 *   npx tsx src/send-payment.ts <to> <amount> [token] [memo]
 *
 * Examples:
 *   npx tsx src/send-payment.ts 0x742d...bEbb 100
 *   npx tsx src/send-payment.ts 0x742d...bEbb 100 AlphaUSD
 *   npx tsx src/send-payment.ts 0x742d...bEbb 100 AlphaUSD "INV-2024-001"
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type { BalanceResult, PaymentResult } from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  formatAmount,
  truncateAddress,
  isValidAddress,
  isValidAmount,
  isValidMemo,
  confirm,
} from '../../shared/utils.js';

function printUsage() {
  console.log('Usage: npx tsx src/send-payment.ts <to> <amount> [token] [memo]');
  console.log('');
  console.log('Arguments:');
  console.log('  to      Recipient address (0x-prefixed)');
  console.log('  amount  Amount to send (human-readable)');
  console.log('  token   Token symbol (default: AlphaUSD)');
  console.log('  memo    Optional memo for reconciliation (max 32 bytes)');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/send-payment.ts 0x742d...bEbb 100');
  console.log('  npx tsx src/send-payment.ts 0x742d...bEbb 100 AlphaUSD "INV-001"');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const [to, amount, token, memo] = args;
  const tokenSymbol = token ?? process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';

  // Validate inputs
  if (!isValidAddress(to)) {
    printError(`Invalid recipient address: ${to}`);
    console.log('Address must be 0x-prefixed 40-character hex string');
    process.exit(1);
  }

  if (!isValidAmount(amount)) {
    printError(`Invalid amount: ${amount}`);
    console.log('Amount must be a positive number');
    process.exit(1);
  }

  if (memo && !isValidMemo(memo)) {
    printError(`Memo too long: ${memo}`);
    console.log('Memo must be at most 32 bytes UTF-8');
    process.exit(1);
  }

  printHeader('Tempo Payment');

  const client = await createTempoClient();

  try {
    // Check balance first
    printInfo('Checking balance...');
    const balance = await callTool<BalanceResult>(client, 'get_balance', {
      token: tokenSymbol,
    });

    const balanceNum = parseFloat(balance.balance);
    const amountNum = parseFloat(amount);

    if (balanceNum < amountNum) {
      printError(
        `Insufficient balance: ${formatAmount(balance.balance)} ${tokenSymbol}`
      );
      console.log(`Required: ${formatAmount(amount)} ${tokenSymbol}`);
      process.exit(1);
    }

    // Display payment details
    console.log('\nPayment Details:');
    printTable(
      ['Field', 'Value'],
      [
        ['From', truncateAddress(balance.address)],
        ['To', truncateAddress(to)],
        ['Amount', `${formatAmount(amount)} ${tokenSymbol}`],
        ['Memo', memo ?? '(none)'],
        ['Balance After', `~${formatAmount(balanceNum - amountNum)} ${tokenSymbol}`],
      ]
    );

    // Confirm
    const shouldProceed = await confirm('\nConfirm payment?');
    if (!shouldProceed) {
      printInfo('Payment cancelled');
      process.exit(0);
    }

    // Send payment
    printInfo('Sending payment...');
    const paymentArgs: Record<string, unknown> = {
      token: tokenSymbol,
      to,
      amount,
    };
    if (memo) {
      paymentArgs.memo = memo;
    }

    const result = await callTool<PaymentResult>(
      client,
      'send_payment',
      paymentArgs
    );

    if (!result.success) {
      printError(`Payment failed: ${result.error?.message}`);
      if (result.error?.details?.suggestion) {
        printInfo(`Suggestion: ${result.error.details.suggestion}`);
      }
      process.exit(1);
    }

    printSuccess('Payment sent successfully!');
    console.log('');
    printTable(
      ['Field', 'Value'],
      [
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Amount', `${result.amount} ${result.tokenSymbol}`],
        ['Gas Cost', result.gasCost ?? 'N/A'],
        ['Timestamp', result.timestamp ?? 'N/A'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }
  } catch (error) {
    printError(`Failed to send payment: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

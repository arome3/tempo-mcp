/**
 * Send Sponsored Payment Script
 *
 * Standalone script to send a token payment with gas fees paid by a sponsor.
 * This enables gasless transactions where recipients don't need native tokens.
 *
 * Usage:
 *   npx tsx src/send-sponsored-payment.ts <to> <amount> [token] [memo] [--relay]
 *
 * Examples:
 *   npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100
 *   npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100 AlphaUSD
 *   npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100 AlphaUSD "INV-2024-001"
 *   npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100 AlphaUSD --relay
 *
 * Environment Variables:
 *   TEMPO_FEE_SPONSORSHIP_ENABLED=true   Enable sponsorship
 *   TEMPO_FEE_PAYER_ADDRESS              Fee payer wallet address
 *   TEMPO_FEE_PAYER_KEY                  Fee payer private key (for local mode)
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  BalanceResult,
  SponsoredPaymentResult,
  EstimateSponsoredGasResult,
  SponsorBalanceResult,
} from '../../shared/types.js';
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
  console.log('Usage: npx tsx src/send-sponsored-payment.ts <to> <amount> [token] [memo] [--relay]');
  console.log('');
  console.log('Arguments:');
  console.log('  to       Recipient address (0x-prefixed)');
  console.log('  amount   Amount to send (human-readable)');
  console.log('  token    Token symbol (default: AlphaUSD)');
  console.log('  memo     Optional memo for reconciliation (max 32 bytes)');
  console.log('  --relay  Use Tempo testnet relay instead of local fee payer');
  console.log('');
  console.log('Environment Variables:');
  console.log('  TEMPO_FEE_SPONSORSHIP_ENABLED=true   Enable sponsorship');
  console.log('  TEMPO_FEE_PAYER_ADDRESS              Fee payer wallet address');
  console.log('  TEMPO_FEE_PAYER_KEY                  Fee payer private key');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100');
  console.log('  npx tsx src/send-sponsored-payment.ts 0x742d...bEbb 100 AlphaUSD --relay');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  // Parse --relay flag
  const useRelay = args.includes('--relay');
  const filteredArgs = args.filter(arg => arg !== '--relay');

  const [to, amount, token, memo] = filteredArgs;
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

  // Check environment
  if (process.env.TEMPO_FEE_SPONSORSHIP_ENABLED !== 'true') {
    printError('Fee sponsorship is not enabled');
    console.log('Set TEMPO_FEE_SPONSORSHIP_ENABLED=true in your environment');
    process.exit(1);
  }

  printHeader('Tempo Sponsored Payment');
  console.log(`Mode: ${useRelay ? 'Testnet Relay' : 'Local Fee Payer'}`);

  const client = await createTempoClient();

  try {
    // Check sender balance first
    printInfo('Checking sender balance...');
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

    // Check sponsor balance
    printInfo('Checking sponsor balance...');
    const sponsorBalance = await callTool<SponsorBalanceResult>(
      client,
      'get_sponsor_balance',
      { token: tokenSymbol }
    );
    console.log(`Sponsor Balance: ${formatAmount(sponsorBalance.balance)} ${sponsorBalance.tokenSymbol}`);

    // Estimate gas cost
    printInfo('Estimating gas cost...');
    const gasEstimate = await callTool<EstimateSponsoredGasResult>(
      client,
      'estimate_sponsored_gas',
      {
        token: tokenSymbol,
        to,
        amount,
      }
    );

    // Display payment details
    console.log('\nSponsored Payment Details:');
    printTable(
      ['Field', 'Value'],
      [
        ['From', truncateAddress(balance.address)],
        ['To', truncateAddress(to)],
        ['Amount', `${formatAmount(amount)} ${tokenSymbol}`],
        ['Memo', memo ?? '(none)'],
        ['Fee Payer', useRelay ? 'Tempo Testnet Relay' : truncateAddress(sponsorBalance.sponsor)],
        ['Estimated Fee', `${gasEstimate.estimatedFee} ${gasEstimate.feeTokenSymbol}`],
        ['Gas Limit', gasEstimate.gasLimit],
      ]
    );

    // Confirm
    const shouldProceed = await confirm('\nConfirm sponsored payment?');
    if (!shouldProceed) {
      printInfo('Payment cancelled');
      process.exit(0);
    }

    // Send sponsored payment
    printInfo('Sending sponsored payment...');
    const paymentArgs: Record<string, unknown> = {
      token: tokenSymbol,
      to,
      amount,
      useRelay,
    };
    if (memo) {
      paymentArgs.memo = memo;
    }

    const result = await callTool<SponsoredPaymentResult>(
      client,
      'send_sponsored_payment',
      paymentArgs
    );

    if (!result.success) {
      printError(`Payment failed: ${result.error?.message}`);
      if (result.error?.details?.suggestion) {
        printInfo(`Suggestion: ${result.error.details.suggestion}`);
      }
      process.exit(1);
    }

    printSuccess('Sponsored payment sent successfully!');
    console.log('');
    printTable(
      ['Field', 'Value'],
      [
        ['Transaction', result.transactionHash ?? 'N/A'],
        ['Block', result.blockNumber?.toString() ?? 'Pending'],
        ['Amount', `${result.amount} ${result.tokenSymbol}`],
        ['Fee Payer', result.feePayer ?? 'N/A'],
        ['Fee Amount', result.feeAmount ?? 'N/A'],
        ['Timestamp', result.timestamp ?? 'N/A'],
      ]
    );

    if (result.explorerUrl) {
      console.log(`\nExplorer: ${result.explorerUrl}`);
    }
  } catch (error) {
    printError(`Failed to send sponsored payment: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

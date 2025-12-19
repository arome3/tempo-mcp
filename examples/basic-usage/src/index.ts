/**
 * Basic Usage Example
 *
 * Demonstrates the core tempo-mcp workflow:
 * 1. Check wallet balance
 * 2. Send a payment with memo
 * 3. Verify the transaction
 *
 * Run with: npx tsx src/index.ts
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  BalanceResult,
  PaymentResult,
  TransactionResult,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  formatAmount,
  truncateAddress,
  confirm,
} from '../../shared/utils.js';

// Demo configuration
const DEMO_TOKEN = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';
const DEMO_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';
const DEMO_AMOUNT = '1.00';
const DEMO_MEMO = 'DEMO-001';

async function main() {
  printHeader('Tempo MCP - Basic Usage Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Check your wallet balance');
  console.log('3. Send a small test payment (1 AlphaUSD)');
  console.log('4. Verify the transaction\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Check balance
    printHeader('Step 1: Check Balance');

    const balance = await callTool<BalanceResult>(client, 'get_balance', {
      token: DEMO_TOKEN,
    });

    console.log(`Token: ${balance.tokenSymbol} (${balance.tokenName})`);
    console.log(`Address: ${balance.address}`);
    console.log(`Balance: ${formatAmount(balance.balance)} ${balance.tokenSymbol}`);

    // Check if we have enough for the demo
    const balanceNum = parseFloat(balance.balance);
    if (balanceNum < parseFloat(DEMO_AMOUNT)) {
      printError(
        `Insufficient balance for demo. Need at least ${DEMO_AMOUNT} ${DEMO_TOKEN}`
      );
      printInfo(
        'Get testnet tokens from: https://docs.tempo.xyz/quickstart/faucet'
      );
      return;
    }

    // Step 2: Confirm payment
    printHeader('Step 2: Send Payment');

    console.log('Payment Details:');
    printTable(
      ['Field', 'Value'],
      [
        ['Token', DEMO_TOKEN],
        ['To', truncateAddress(DEMO_RECIPIENT)],
        ['Amount', `${DEMO_AMOUNT} ${DEMO_TOKEN}`],
        ['Memo', DEMO_MEMO],
      ]
    );

    const shouldProceed = await confirm('\nProceed with payment?');
    if (!shouldProceed) {
      printInfo('Payment cancelled by user');
      return;
    }

    // Send payment
    printInfo('Sending payment...');
    const payment = await callTool<PaymentResult>(client, 'send_payment', {
      token: DEMO_TOKEN,
      to: DEMO_RECIPIENT,
      amount: DEMO_AMOUNT,
      memo: DEMO_MEMO,
    });

    if (!payment.success) {
      printError(`Payment failed: ${payment.error?.message}`);
      return;
    }

    printSuccess('Payment sent successfully!');
    console.log(`Transaction: ${payment.transactionHash}`);
    console.log(`Explorer: ${payment.explorerUrl}`);

    // Step 3: Verify transaction
    printHeader('Step 3: Verify Transaction');

    printInfo('Fetching transaction details...');
    const tx = await callTool<TransactionResult>(client, 'get_transaction', {
      hash: payment.transactionHash,
    });

    console.log('Transaction Details:');
    printTable(
      ['Field', 'Value'],
      [
        ['Hash', truncateAddress(tx.hash, 8)],
        ['Status', tx.status.toUpperCase()],
        ['Block', tx.blockNumber?.toString() ?? 'Pending'],
        ['From', truncateAddress(tx.from)],
        ['To', truncateAddress(tx.to ?? '')],
        ['Amount', tx.token ? `${tx.token.amount} ${tx.token.symbol}` : tx.value],
        ['Memo', tx.memoDecoded ?? 'N/A'],
        ['Gas Cost', tx.gasCost],
        ['Confirmations', tx.confirmations.toString()],
      ]
    );

    // Final balance
    printHeader('Final Balance');

    const finalBalance = await callTool<BalanceResult>(client, 'get_balance', {
      token: DEMO_TOKEN,
    });

    console.log(
      `Balance: ${formatAmount(finalBalance.balance)} ${finalBalance.tokenSymbol}`
    );
    console.log(
      `Change: -${formatAmount(DEMO_AMOUNT)} ${DEMO_TOKEN} (+ gas)`
    );

    printSuccess('Demo completed successfully!');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

/**
 * Rewards Management Example
 *
 * Demonstrates the TIP-20 rewards workflow:
 * 1. Check current reward status
 * 2. View pending rewards
 * 3. Check opt-in status
 * 4. Display token-wide reward statistics
 *
 * Run with: npx tsx src/check-rewards.ts
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  GetRewardStatusResult,
  GetPendingRewardsResult,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
} from '../../shared/utils.js';

// Demo configuration
const DEMO_TOKEN = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';
const DEMO_ADDRESS = process.env.TEMPO_WALLET_ADDRESS ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';

async function main() {
  printHeader('Tempo MCP - Rewards Management Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Check your reward status');
  console.log('3. View pending rewards');
  console.log('4. Display token statistics\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Get full reward status
    printHeader('Step 1: Check Reward Status');
    console.log(`Token: ${DEMO_TOKEN}`);
    console.log(`Address: ${truncateAddress(DEMO_ADDRESS)}\n`);

    const status = await callTool<GetRewardStatusResult>(
      client,
      'get_reward_status',
      {
        token: DEMO_TOKEN,
        address: DEMO_ADDRESS,
      }
    );

    printTable(
      ['Property', 'Value'],
      [
        ['Opted In', status.isOptedIn ? '✓ Yes' : '✗ No'],
        ['Pending Rewards', status.pendingRewardsFormatted],
        ['Opted-In Balance', status.optedInBalanceFormatted],
        ['Total Balance', status.totalBalanceFormatted],
        ['Total Claimed', status.totalClaimedFormatted],
        ['Reward Recipient', status.rewardRecipient ? truncateAddress(status.rewardRecipient) : 'Self (default)'],
      ]
    );

    // Step 2: Check pending rewards for another address (optional demo)
    printHeader('Step 2: View Pending Rewards');

    try {
      const pending = await callTool<GetPendingRewardsResult>(
        client,
        'get_pending_rewards',
        {
          token: DEMO_TOKEN,
          address: DEMO_ADDRESS,
        }
      );

      if (pending.isOptedIn) {
        printSuccess(`Pending Rewards: ${pending.pendingRewardsFormatted} ${pending.tokenSymbol}`);
        if (parseFloat(pending.pendingRewards) > 0) {
          console.log('\nYou have unclaimed rewards! Use the claim_rewards tool to claim them.');
        }
      } else {
        printInfo('Not opted into rewards for this token.');
        console.log('\nTo start earning rewards, use the opt_in_rewards tool.');
      }
    } catch (error) {
      printInfo('Unable to fetch pending rewards');
    }

    // Step 3: Display token-wide statistics
    printHeader('Step 3: Token Reward Statistics');
    console.log(`\n${DEMO_TOKEN} Reward Pool Stats:`);

    printTable(
      ['Metric', 'Value'],
      [
        ['Total Opted-In Supply', status.tokenStats.totalOptedInSupplyFormatted],
        ['Total Distributed', status.tokenStats.totalDistributedFormatted],
      ]
    );

    // Step 4: Summary and recommendations
    printHeader('Summary');

    if (!status.isOptedIn) {
      printInfo('You are not opted into rewards for this token.\n');
      console.log('To participate in the rewards program:');
      console.log('  1. Call opt_in_rewards with your token');
      console.log('  2. Your balance will start earning pro-rata rewards');
      console.log('  3. Use claim_rewards to claim your pending rewards');
    } else if (parseFloat(status.pendingRewards) > 0) {
      printSuccess('You have pending rewards to claim!\n');
      console.log(`Pending: ${status.pendingRewardsFormatted} ${status.tokenSymbol}`);
      console.log('\nUse the claim_rewards tool to claim your rewards.');
      if (status.rewardRecipient) {
        console.log(`Rewards will be sent to: ${truncateAddress(status.rewardRecipient)}`);
      }
    } else {
      printSuccess('You are opted into rewards!\n');
      console.log(`Opted-in balance: ${status.optedInBalanceFormatted}`);
      console.log('You will automatically accrue rewards as they are distributed.');
    }

    printSuccess('\nDemo completed successfully!');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

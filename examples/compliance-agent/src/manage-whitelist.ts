/**
 * Manage Whitelist Entries
 *
 * Add or remove addresses from a policy's whitelist.
 * Requires the caller to be the policy owner.
 *
 * Usage:
 *   npx tsx src/manage-whitelist.ts add <policyId> <address>
 *   npx tsx src/manage-whitelist.ts remove <policyId> <address>
 *   npx tsx src/manage-whitelist.ts check <policyId> <address>
 *
 * Example:
 *   npx tsx src/manage-whitelist.ts add 1 0xABC...123
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  IsWhitelistedResult,
  AddToWhitelistResult,
  RemoveFromWhitelistResult,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
  confirm,
} from '../../shared/utils.js';

type Action = 'add' | 'remove' | 'check';

function printUsage(): void {
  console.log('Whitelist Management Tool');
  console.log('');
  console.log('Usage:');
  console.log('  npx tsx src/manage-whitelist.ts add <policyId> <address>');
  console.log('  npx tsx src/manage-whitelist.ts remove <policyId> <address>');
  console.log('  npx tsx src/manage-whitelist.ts check <policyId> <address>');
  console.log('');
  console.log('Actions:');
  console.log('  add     Add address to whitelist (requires policy owner)');
  console.log('  remove  Remove address from whitelist (requires policy owner)');
  console.log('  check   Check if address is whitelisted');
  console.log('');
  console.log('Example:');
  console.log('  npx tsx src/manage-whitelist.ts check 1 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    printUsage();
    process.exit(1);
  }

  const action = args[0] as Action;
  const policyId = parseInt(args[1], 10);
  const account = args[2];

  if (!['add', 'remove', 'check'].includes(action)) {
    printError(`Invalid action: ${action}`);
    printUsage();
    process.exit(1);
  }

  if (isNaN(policyId) || policyId < 1) {
    printError(`Invalid policy ID: ${args[1]}`);
    process.exit(1);
  }

  printHeader(`Whitelist ${action.toUpperCase()}`);

  console.log('Parameters:');
  console.log(`  Policy ID: ${policyId}`);
  console.log(`  Account:   ${truncateAddress(account)}\n`);

  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();

  try {
    switch (action) {
      case 'check': {
        const result = await callTool<IsWhitelistedResult>(
          client,
          'is_whitelisted',
          { policyId, account }
        );

        printTable(
          ['Field', 'Value'],
          [
            ['Policy ID', result.policyId.toString()],
            ['Account', truncateAddress(result.account)],
            ['Is Whitelisted', result.isWhitelisted ? 'YES' : 'NO'],
          ]
        );

        if (result.isWhitelisted) {
          printSuccess('Address is whitelisted');
        } else {
          printInfo('Address is NOT whitelisted');
        }
        break;
      }

      case 'add': {
        // First check current status
        const currentStatus = await callTool<IsWhitelistedResult>(
          client,
          'is_whitelisted',
          { policyId, account }
        );

        if (currentStatus.isWhitelisted) {
          printInfo('Address is already whitelisted');
          return;
        }

        // Confirm action
        const shouldProceed = await confirm(
          `Add ${truncateAddress(account)} to whitelist?`
        );
        if (!shouldProceed) {
          printInfo('Cancelled by user');
          return;
        }

        printInfo('Adding to whitelist...');
        const result = await callTool<AddToWhitelistResult>(
          client,
          'add_to_whitelist',
          { policyId, account }
        );

        if (result.success) {
          printSuccess('Address added to whitelist!');
          printTable(
            ['Field', 'Value'],
            [
              ['Transaction', truncateAddress(result.transactionHash ?? '', 8)],
              ['Block', result.blockNumber?.toString() ?? 'N/A'],
              ['Added By', truncateAddress(result.addedBy ?? '')],
              ['Gas Cost', result.gasCost ?? 'N/A'],
            ]
          );
          console.log(`\nExplorer: ${result.explorerUrl}`);
        } else {
          printError(`Failed: ${result.error?.message}`);
        }
        break;
      }

      case 'remove': {
        // First check current status
        const currentStatus = await callTool<IsWhitelistedResult>(
          client,
          'is_whitelisted',
          { policyId, account }
        );

        if (!currentStatus.isWhitelisted) {
          printInfo('Address is not whitelisted');
          return;
        }

        // Confirm action
        const shouldProceed = await confirm(
          `Remove ${truncateAddress(account)} from whitelist?`
        );
        if (!shouldProceed) {
          printInfo('Cancelled by user');
          return;
        }

        printInfo('Removing from whitelist...');
        const result = await callTool<RemoveFromWhitelistResult>(
          client,
          'remove_from_whitelist',
          { policyId, account }
        );

        if (result.success) {
          printSuccess('Address removed from whitelist!');
          printTable(
            ['Field', 'Value'],
            [
              ['Transaction', truncateAddress(result.transactionHash ?? '', 8)],
              ['Block', result.blockNumber?.toString() ?? 'N/A'],
              ['Removed By', truncateAddress(result.removedBy ?? '')],
              ['Gas Cost', result.gasCost ?? 'N/A'],
            ]
          );
          console.log(`\nExplorer: ${result.explorerUrl}`);
        } else {
          printError(`Failed: ${result.error?.message}`);
        }
        break;
      }
    }
  } catch (error) {
    printError(`Operation failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

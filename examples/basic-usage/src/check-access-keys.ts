/**
 * Access Key Management Example
 *
 * Demonstrates the access key (session key) workflow for delegated signing:
 * 1. Check access key information
 * 2. View remaining spending limits
 * 3. Display key status and expiry
 *
 * Access keys enable delegated signing for automation and dApps without
 * exposing the main wallet private key.
 *
 * Run with: npx tsx src/check-access-keys.ts
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import type {
  GetAccessKeyInfoResult,
  GetRemainingLimitResult,
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
const DEMO_KEY_ID = process.env.DEMO_ACCESS_KEY_ID ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';
const DEMO_ACCOUNT = process.env.TEMPO_WALLET_ADDRESS ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';

async function main() {
  printHeader('Tempo MCP - Access Key Management Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Check access key information');
  console.log('3. View remaining spending limits');
  console.log('4. Display key status summary\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Get access key information
    printHeader('Step 1: Access Key Information');
    console.log(`Key ID: ${truncateAddress(DEMO_KEY_ID)}`);
    console.log(`Account: ${truncateAddress(DEMO_ACCOUNT)}\n`);

    let keyInfo: GetAccessKeyInfoResult;
    try {
      keyInfo = await callTool<GetAccessKeyInfoResult>(
        client,
        'get_access_key_info',
        {
          keyId: DEMO_KEY_ID,
          account: DEMO_ACCOUNT,
        }
      );

      if (!keyInfo.found) {
        printInfo('Access key not found or not registered for this account.\n');
        console.log('To create an access key:');
        console.log('  1. Use the create_access_key tool');
        console.log('  2. Specify signature type (secp256k1, p256, or webauthn)');
        console.log('  3. Optionally set expiry and spending limits\n');

        printSuccess('Demo completed - no active key found.');
        return;
      }

      printTable(
        ['Property', 'Value'],
        [
          ['Key ID', truncateAddress(keyInfo.keyId)],
          ['Account', truncateAddress(keyInfo.account)],
          ['Signature Type', keyInfo.signatureTypeDescription ?? 'Unknown'],
          ['Active', keyInfo.isActive ? '✓ Yes' : '✗ No'],
          ['Revoked', keyInfo.isRevoked ? '✗ Yes' : '✓ No'],
          ['Enforce Limits', keyInfo.enforceLimits ? 'Yes' : 'No (unlimited)'],
          ['Expiry', keyInfo.expiryISO ?? 'Never'],
          ['Expired', keyInfo.isExpired ? '✗ Yes' : '✓ No'],
        ]
      );
    } catch (error) {
      printError('Unable to fetch access key info');
      throw error;
    }

    // Step 2: Check remaining spending limit
    printHeader('Step 2: Spending Limits');
    console.log(`Token: ${DEMO_TOKEN}\n`);

    if (!keyInfo.enforceLimits) {
      printInfo('This key has unlimited spending (enforceLimits = false)');
    } else {
      try {
        const limit = await callTool<GetRemainingLimitResult>(
          client,
          'get_remaining_limit',
          {
            keyId: DEMO_KEY_ID,
            token: DEMO_TOKEN,
            account: DEMO_ACCOUNT,
          }
        );

        if (limit.isUnlimited) {
          printInfo(`No limit set for ${DEMO_TOKEN} - unlimited spending allowed`);
        } else {
          printTable(
            ['Metric', 'Value'],
            [
              ['Token', DEMO_TOKEN],
              ['Remaining Limit', limit.remainingLimitFormatted],
              ['Unlimited', limit.isUnlimited ? 'Yes' : 'No'],
            ]
          );
        }
      } catch (error) {
        printInfo('Unable to fetch spending limit for this token');
      }
    }

    // Step 3: Summary and recommendations
    printHeader('Summary');

    if (!keyInfo.isActive) {
      if (keyInfo.isRevoked) {
        printError('This access key has been revoked.\n');
        console.log('Revoked keys cannot be used for signing.');
        console.log('Create a new access key if needed.');
      } else if (keyInfo.isExpired) {
        printError('This access key has expired.\n');
        console.log(`Expired at: ${keyInfo.expiryISO}`);
        console.log('Create a new access key with a later expiry.');
      }
    } else {
      printSuccess('Access key is active and ready for use!\n');

      console.log('Key Capabilities:');
      console.log(`  - Signature Type: ${keyInfo.signatureTypeDescription}`);
      if (keyInfo.enforceLimits) {
        console.log('  - Spending limits are enforced');
        console.log('  - Use update_spending_limit to modify limits');
      } else {
        console.log('  - No spending limits (full access)');
      }

      if (keyInfo.expiryISO) {
        console.log(`  - Expires: ${keyInfo.expiryISO}`);
      } else {
        console.log('  - No expiration set');
      }

      console.log('\nAvailable Operations:');
      console.log('  - revoke_access_key: Permanently disable this key');
      console.log('  - update_spending_limit: Modify token spending limits');
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

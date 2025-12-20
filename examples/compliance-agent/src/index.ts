/**
 * Compliance Agent Example
 *
 * Demonstrates TIP-403 Policy Registry compliance management:
 * 1. Check policy information
 * 2. Verify transfer compliance
 * 3. Check whitelist/blacklist status
 * 4. Manage whitelist entries (if policy owner)
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
  GetPolicyInfoResult,
  CheckTransferComplianceResult,
  IsWhitelistedResult,
  IsBlacklistedResult,
} from '../../shared/types.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
} from '../../shared/utils.js';

// Configuration
const DEFAULT_POLICY_ID = parseInt(process.env.TEMPO_DEFAULT_POLICY_ID ?? '1', 10);
const DEMO_TOKEN = '0x20c0000000000000000000000000000000000001'; // AlphaUSD
const DEMO_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';

async function main() {
  printHeader('Tempo MCP - Compliance Agent Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Get policy information');
  console.log('3. Check transfer compliance');
  console.log('4. Verify whitelist/blacklist status\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Get Policy Information
    printHeader('Step 1: Policy Information');

    try {
      const policyInfo = await callTool<GetPolicyInfoResult>(
        client,
        'get_policy_info',
        { policyId: DEFAULT_POLICY_ID }
      );

      console.log('Policy Details:');
      printTable(
        ['Field', 'Value'],
        [
          ['Policy ID', policyInfo.policyId.toString()],
          ['Type', policyInfo.policyType],
          ['Description', policyInfo.policyTypeDescription],
          ['Owner', truncateAddress(policyInfo.owner)],
          ['Token Count', policyInfo.tokenCount.toString()],
        ]
      );
    } catch (error) {
      printError(`Could not fetch policy info: ${(error as Error).message}`);
      printInfo('Policy may not exist or registry may not be accessible');
    }

    // Step 2: Check Transfer Compliance
    printHeader('Step 2: Transfer Compliance Check');

    try {
      const compliance = await callTool<CheckTransferComplianceResult>(
        client,
        'check_transfer_compliance',
        {
          token: DEMO_TOKEN,
          from: DEMO_ADDRESS,
          to: '0x0000000000000000000000000000000000000001',
        }
      );

      console.log('Compliance Check:');
      printTable(
        ['Field', 'Value'],
        [
          ['Token', truncateAddress(compliance.token)],
          ['From', truncateAddress(compliance.from)],
          ['To', truncateAddress(compliance.to)],
          ['Policy Type', compliance.policyType],
          ['Transfer Allowed', compliance.allowed ? 'YES' : 'NO'],
          ['Reason', compliance.reason ?? 'N/A'],
        ]
      );

      if (compliance.allowed) {
        printSuccess('Transfer is compliant with policy');
      } else {
        printError('Transfer would be blocked by policy');
      }
    } catch (error) {
      printInfo(`Compliance check skipped: ${(error as Error).message}`);
    }

    // Step 3: Check Whitelist Status
    printHeader('Step 3: Whitelist Status');

    try {
      const whitelistStatus = await callTool<IsWhitelistedResult>(
        client,
        'is_whitelisted',
        {
          policyId: DEFAULT_POLICY_ID,
          account: DEMO_ADDRESS,
        }
      );

      console.log('Whitelist Check:');
      printTable(
        ['Field', 'Value'],
        [
          ['Policy ID', whitelistStatus.policyId.toString()],
          ['Account', truncateAddress(whitelistStatus.account)],
          ['Is Whitelisted', whitelistStatus.isWhitelisted ? 'YES' : 'NO'],
        ]
      );
    } catch (error) {
      printInfo(`Whitelist check skipped: ${(error as Error).message}`);
    }

    // Step 4: Check Blacklist Status
    printHeader('Step 4: Blacklist Status');

    try {
      const blacklistStatus = await callTool<IsBlacklistedResult>(
        client,
        'is_blacklisted',
        {
          policyId: DEFAULT_POLICY_ID,
          account: DEMO_ADDRESS,
        }
      );

      console.log('Blacklist Check:');
      printTable(
        ['Field', 'Value'],
        [
          ['Policy ID', blacklistStatus.policyId.toString()],
          ['Account', truncateAddress(blacklistStatus.account)],
          ['Is Blacklisted', blacklistStatus.isBlacklisted ? 'YES' : 'NO'],
        ]
      );

      if (blacklistStatus.isBlacklisted) {
        printError('Address is on the blacklist - transfers are blocked');
      } else {
        printSuccess('Address is not blacklisted');
      }
    } catch (error) {
      printInfo(`Blacklist check skipped: ${(error as Error).message}`);
    }

    printHeader('Demo Complete');
    printSuccess('Compliance checks finished successfully!');
    console.log('\nFor more operations, try:');
    console.log('  npm run check     - Check compliance for specific addresses');
    console.log('  npm run whitelist - Manage whitelist entries');
    console.log('  npm run report    - Generate compliance report');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

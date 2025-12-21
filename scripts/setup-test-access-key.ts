#!/usr/bin/env npx tsx
/**
 * Setup Test Access Key
 *
 * This script creates a test access key on the Tempo testnet for E2E testing.
 * It generates a secp256k1 key pair, authorizes it, and saves the details.
 *
 * Usage:
 *   npx tsx scripts/setup-test-access-key.ts
 *
 * Prerequisites:
 *   - TEMPO_PRIVATE_KEY set in .env (root key that will authorize the access key)
 *   - Testnet funds in the wallet for gas
 *
 * Output:
 *   - Prints the keyId and private key for the new access key
 *   - Optionally saves to .env.test for use in E2E tests
 */

import 'dotenv/config';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, formatEther, defineChain } from 'viem';

// Define Tempo testnet chain
const tempoTestnet = defineChain({
  id: 42429,
  name: 'Tempo Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'TEMPO',
    symbol: 'TEMPO',
  },
  rpcUrls: {
    default: {
      http: [process.env.TEMPO_RPC_URL || 'https://rpc.testnet.tempo.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Tempo Explorer',
      url: process.env.TEMPO_EXPLORER_URL || 'https://explore.tempo.xyz',
    },
  },
});

// Account Keychain precompile address
const ACCOUNT_KEYCHAIN_ADDRESS = '0xac00000000000000000000000000000000000000' as const;

// Signature types
const SignatureType = {
  Secp256k1: 0,
  P256: 1,
  WebAuthn: 2,
} as const;

// ABI for authorizeKey
const AUTHORIZE_KEY_ABI = [
  {
    name: 'authorizeKey',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyId', type: 'address' },
      { name: 'signatureType', type: 'uint8' },
      { name: 'expiry', type: 'uint64' },
      { name: 'enforceLimits', type: 'bool' },
      {
        name: 'limits',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

async function main() {
  console.log('\n========================================');
  console.log('  Setup Test Access Key');
  console.log('========================================\n');

  // Check for root key
  const rootPrivateKey = process.env.TEMPO_PRIVATE_KEY;
  if (!rootPrivateKey) {
    console.error('Error: TEMPO_PRIVATE_KEY not set in .env');
    console.log('This is required to authorize the new access key.');
    process.exit(1);
  }

  // Create root account (the one authorizing the access key)
  const rootAccount = privateKeyToAccount(rootPrivateKey as `0x${string}`);
  console.log(`Root Account: ${rootAccount.address}`);

  // Create clients
  const publicClient = createPublicClient({
    chain: tempoTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account: rootAccount,
    chain: tempoTestnet,
    transport: http(),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: rootAccount.address });
  console.log(`Balance: ${formatEther(balance)} TEMPO`);

  if (balance === 0n) {
    console.error('\nError: No balance for gas fees.');
    console.log('Get testnet tokens from: https://docs.tempo.xyz/quickstart/faucet');
    process.exit(1);
  }

  // Generate a new key pair for the access key
  console.log('\n--- Generating Access Key ---');
  const accessKeyPrivateKey = generatePrivateKey();
  const accessKeyAccount = privateKeyToAccount(accessKeyPrivateKey);
  const keyId = accessKeyAccount.address;

  console.log(`Access Key ID: ${keyId}`);
  console.log(`Access Key Private Key: ${accessKeyPrivateKey}`);

  // Configuration for the access key
  const expiry = 0; // Never expires (for testing)
  const enforceLimits = true;
  const limits: Array<{ token: `0x${string}`; amount: bigint }> = [
    {
      token: '0x20c0000000000000000000000000000000000001' as `0x${string}`, // AlphaUSD
      amount: BigInt(10000 * 1e6), // 10,000 tokens limit
    },
  ];

  console.log('\n--- Authorizing Access Key ---');
  console.log(`Signature Type: secp256k1 (${SignatureType.Secp256k1})`);
  console.log(`Expiry: ${expiry === 0 ? 'Never' : new Date(expiry * 1000).toISOString()}`);
  console.log(`Enforce Limits: ${enforceLimits}`);
  console.log(`Token Limits: ${limits.length} token(s)`);

  try {
    // Authorize the key
    const hash = await walletClient.writeContract({
      address: ACCOUNT_KEYCHAIN_ADDRESS,
      abi: AUTHORIZE_KEY_ABI,
      functionName: 'authorizeKey',
      args: [keyId, SignatureType.Secp256k1, BigInt(expiry), enforceLimits, limits],
    });

    console.log(`\nTransaction Hash: ${hash}`);
    console.log('Waiting for confirmation...');

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`\n✓ Access Key Authorized Successfully!`);
      console.log(`Block: ${receipt.blockNumber}`);
      console.log(`Gas Used: ${receipt.gasUsed}`);

      // Print summary for E2E tests
      console.log('\n========================================');
      console.log('  Add to .env for E2E Tests');
      console.log('========================================');
      console.log(`E2E_ACCESS_KEY_ID=${keyId}`);
      console.log(`E2E_ACCESS_KEY_PRIVATE_KEY=${accessKeyPrivateKey}`);
      console.log('========================================\n');

      console.log('You can now update the E2E tests to use this access key.');
      console.log('The key is authorized for your wallet and can be revoked or updated.\n');
    } else {
      console.error('\n✗ Transaction reverted!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\nError authorizing key:', (error as Error).message);

    // Check for common errors
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('KeyAlreadyExists')) {
      console.log('\nThis key ID is already authorized. Generate a new one or revoke the existing key.');
    } else if (errorMsg.includes('insufficient funds')) {
      console.log('\nInsufficient funds for gas. Get testnet tokens from the faucet.');
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

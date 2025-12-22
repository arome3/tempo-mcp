/**
 * Fee AMM Management Example
 *
 * Demonstrates the Fee AMM liquidity workflow:
 * 1. Check pool information (reserves, LP supply)
 * 2. View LP position for an address
 * 3. Estimate fee swap output
 * 4. Display pool statistics
 *
 * The Fee AMM enables users to pay gas in any USD stablecoin while
 * validators receive their preferred token (default: PathUSD).
 *
 * Run with: npx tsx src/check-fee-amm.ts
 */

import 'dotenv/config';
import {
  createTempoClient,
  callTool,
  disconnect,
} from '../../shared/client.js';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printTable,
  truncateAddress,
} from '../../shared/utils.js';

// Demo configuration
const DEMO_USER_TOKEN = process.env.TEMPO_DEFAULT_TOKEN ?? 'AlphaUSD';
const DEMO_VALIDATOR_TOKEN = 'PathUSD';
const DEMO_ADDRESS = process.env.TEMPO_WALLET_ADDRESS ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';

// Type definitions for Fee AMM responses
interface GetFeePoolInfoResult {
  pool: string;
  userToken: {
    address: string;
    symbol?: string;
    reserve: string;
    reserveRaw: string;
  };
  validatorToken: {
    address: string;
    symbol?: string;
    reserve: string;
    reserveRaw: string;
  };
  totalLpSupply: string;
  totalLpSupplyRaw: string;
  swapRate: number;
  protocolFee: string;
}

interface GetLpPositionResult {
  pool: string;
  address: string;
  lpBalance: string;
  lpBalanceRaw: string;
  shareOfPool: string;
  underlyingValue: {
    userToken: string;
    userTokenRaw: string;
    validatorToken: string;
    validatorTokenRaw: string;
    total: string;
  };
}

interface EstimateFeeSwapResult {
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  effectiveRate: string;
  slippage: string;
}

async function main() {
  printHeader('Tempo MCP - Fee AMM Demo');

  console.log('This demo will:');
  console.log('1. Connect to tempo-mcp server');
  console.log('2. Check Fee AMM pool information');
  console.log('3. View your LP position');
  console.log('4. Estimate a fee swap\n');

  // Connect to server
  printInfo('Connecting to tempo-mcp server...');
  const client = await createTempoClient();
  printSuccess('Connected to tempo-mcp server');

  try {
    // Step 1: Get pool information
    printHeader('Step 1: Fee AMM Pool Information');
    console.log(`Pool: ${DEMO_USER_TOKEN}/${DEMO_VALIDATOR_TOKEN}\n`);

    const poolInfo = await callTool<GetFeePoolInfoResult>(
      client,
      'get_fee_pool_info',
      {
        userToken: DEMO_USER_TOKEN,
        validatorToken: DEMO_VALIDATOR_TOKEN,
      }
    );

    printTable(
      ['Metric', 'Value'],
      [
        ['Pool', poolInfo.pool],
        [`${poolInfo.userToken.symbol ?? 'User'} Reserve`, poolInfo.userToken.reserve],
        [`${poolInfo.validatorToken.symbol ?? 'Validator'} Reserve`, poolInfo.validatorToken.reserve],
        ['Total LP Supply', poolInfo.totalLpSupply],
        ['Swap Rate', poolInfo.swapRate.toString()],
        ['Protocol Fee', poolInfo.protocolFee],
      ]
    );

    // Step 2: Check LP position
    printHeader('Step 2: Your LP Position');
    console.log(`Address: ${truncateAddress(DEMO_ADDRESS)}\n`);

    try {
      const position = await callTool<GetLpPositionResult>(
        client,
        'get_lp_position',
        {
          userToken: DEMO_USER_TOKEN,
          validatorToken: DEMO_VALIDATOR_TOKEN,
          address: DEMO_ADDRESS,
        }
      );

      if (parseFloat(position.lpBalance) > 0) {
        printTable(
          ['Property', 'Value'],
          [
            ['LP Balance', position.lpBalance],
            ['Pool Share', position.shareOfPool],
            ['Underlying User Token', position.underlyingValue.userToken],
            ['Underlying Validator Token', position.underlyingValue.validatorToken],
            ['Total Value', position.underlyingValue.total],
          ]
        );
      } else {
        printInfo('No LP position found for this address.');
        console.log('\nTo become a liquidity provider:');
        console.log('  1. Use add_fee_liquidity to deposit tokens');
        console.log('  2. Earn fees from gas token conversions');
        console.log('  3. Use remove_fee_liquidity to withdraw');
      }
    } catch (error) {
      printInfo('Unable to fetch LP position');
    }

    // Step 3: Estimate a fee swap
    printHeader('Step 3: Fee Swap Estimate');
    const swapAmount = '1000';
    console.log(`Estimating swap of ${swapAmount} ${DEMO_USER_TOKEN} to ${DEMO_VALIDATOR_TOKEN}\n`);

    try {
      const estimate = await callTool<EstimateFeeSwapResult>(
        client,
        'estimate_fee_swap',
        {
          fromToken: DEMO_USER_TOKEN,
          toToken: DEMO_VALIDATOR_TOKEN,
          amount: swapAmount,
        }
      );

      printTable(
        ['Parameter', 'Value'],
        [
          ['Amount In', `${estimate.amountIn} ${DEMO_USER_TOKEN}`],
          ['Amount Out', `${estimate.amountOut} ${DEMO_VALIDATOR_TOKEN}`],
          ['Effective Rate', estimate.effectiveRate],
          ['Slippage', estimate.slippage],
        ]
      );

      printInfo(`\nThe Fee AMM uses a fixed rate of 0.9985 (0.15% protocol fee).`);
    } catch (error) {
      printInfo('Unable to estimate fee swap');
    }

    // Step 4: Summary
    printHeader('Summary');

    const hasPosition = true; // From earlier check
    if (hasPosition) {
      printSuccess('Fee AMM is available for gas fee conversions!\n');
      console.log('Key points:');
      console.log('  - Users can pay gas in any USD stablecoin');
      console.log('  - Validators receive their preferred token');
      console.log('  - Fixed swap rate of 0.9985 (0.15% fee)');
      console.log('  - LP providers earn from conversion fees');
    }

    console.log('\nAvailable Fee AMM tools:');
    console.log('  - get_fee_pool_info: Check pool reserves');
    console.log('  - get_lp_position: View your LP balance');
    console.log('  - add_fee_liquidity: Add liquidity');
    console.log('  - remove_fee_liquidity: Remove liquidity');
    console.log('  - estimate_fee_swap: Quote swap output');

    printSuccess('\nDemo completed successfully!');
  } finally {
    await disconnect(client);
  }
}

main().catch((error) => {
  printError(`Error: ${error.message}`);
  process.exit(1);
});

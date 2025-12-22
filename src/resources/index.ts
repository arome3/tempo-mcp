/**
 * Resource Registration
 *
 * Resources provide read-only access to Tempo blockchain data through
 * URI-based lookups. They are useful for AI agents to fetch context
 * without performing actions.
 *
 * Resource URIs:
 * - tempo://network - Network configuration and status
 * - tempo://account/{address} - Account info and token balances
 * - tempo://token/{address} - TIP-20 token metadata
 * - tempo://token/{address}/roles - TIP-20 token role assignments
 * - tempo://token/{address}/rewards - TIP-20 token rewards status
 * - tempo://tx/{hash} - Transaction details
 * - tempo://block/{identifier} - Block information (number or "latest")
 * - tempo://fee-amm/{userToken}/{validatorToken} - Fee AMM pool information
 */

import { server } from '../server.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBalanceService } from '../services/balance-service.js';
import { getTokenService } from '../services/token-service.js';
import { getTransactionService } from '../services/transaction-service.js';
import { getTempoClient } from '../services/tempo-client.js';
import { getRoleService } from '../services/role-service.js';
import { getPolicyService } from '../services/policy-service.js';
import { normalizeError } from '../utils/errors.js';
import { getConfig } from '../config/index.js';
import type { Address, Hash } from 'viem';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response for a resource.
 *
 * @param uri - The resource URI
 * @param data - The data to return
 * @returns Formatted resource response
 */
function createSuccessResponse(uri: URL, data: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error response for a resource.
 *
 * Normalizes any error into a structured format that can be
 * returned to the AI client.
 *
 * @param uri - The resource URI
 * @param error - The error that occurred
 * @returns Formatted error response
 */
function createErrorResponse(uri: URL, error: unknown) {
  const normalized = normalizeError(error);

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            error: true,
            code: normalized.code,
            message: normalized.message,
            details: normalized.details,
            recoverable: normalized.recoverable,
          },
          null,
          2
        ),
      },
    ],
  };
}

// =============================================================================
// Resource Registration
// =============================================================================

/**
 * Register all MCP resources with the server.
 *
 * Resources registered:
 * - tempo://network - Static network configuration with dynamic block number
 * - tempo://account/{address} - Account information and balances
 * - tempo://token/{address} - TIP-20 token metadata
 * - tempo://tx/{hash} - Transaction details
 * - tempo://block/{identifier} - Block information
 */
export function registerAllResources(): void {
  // ===========================================================================
  // Static Resource: Network Information
  // ===========================================================================
  server.registerResource(
    'network-info',
    'tempo://network',
    {
      title: 'Network Information',
      description: 'Tempo blockchain network configuration and current status',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const config = getConfig();
        const client = getTempoClient();
        const publicClient = client['publicClient'];

        // Fetch current block number for live status
        const blockNumber = await publicClient.getBlockNumber();

        const networkData = {
          name: 'Tempo Testnet (Andantino)',
          chainId: config.network.chainId,
          rpcUrl: config.network.rpcUrl,
          explorerUrl: config.network.explorerUrl,
          blockTime: '~0.6 seconds',
          currency: 'USD',
          currentBlock: Number(blockNumber),
          defaultToken: {
            symbol: config.tokens.default,
            address: config.tokens.aliases[config.tokens.default],
            decimals: 6,
          },
        };

        return createSuccessResponse(uri, networkData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Account Information
  // ===========================================================================
  server.registerResource(
    'account',
    new ResourceTemplate('tempo://account/{address}', { list: undefined }),
    {
      title: 'Account Information',
      description:
        'Account details including type (EOA/contract), token balances, and transaction count',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const address = params.address as Address;

      try {
        const balanceService = getBalanceService();
        const accountInfo = await balanceService.getAccountInfo(address);

        return createSuccessResponse(uri, accountInfo);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Token Information
  // ===========================================================================
  server.registerResource(
    'token',
    new ResourceTemplate('tempo://token/{address}', { list: undefined }),
    {
      title: 'Token Information',
      description: 'TIP-20 token metadata including name, symbol, decimals, and total supply',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const address = params.address as Address;

      try {
        const tokenService = getTokenService();
        const tokenInfo = await tokenService.getTokenInfo(address);

        return createSuccessResponse(uri, tokenInfo);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Token Role Assignments
  // ===========================================================================
  server.registerResource(
    'token-roles',
    new ResourceTemplate('tempo://token/{address}/roles', { list: undefined }),
    {
      title: 'Token Role Assignments',
      description:
        'TIP-20 token role-based access control (RBAC) information including all role assignments and pause status',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const address = params.address as Address;

      try {
        const roleService = getRoleService();
        const rolesInfo = await roleService.getTokenRolesInfo(address);

        return createSuccessResponse(uri, rolesInfo);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Token Rewards Status
  // ===========================================================================
  server.registerResource(
    'token-rewards',
    new ResourceTemplate('tempo://token/{address}/rewards', { list: undefined }),
    {
      title: 'Token Rewards Status',
      description:
        'TIP-20 token rewards information including opt-in status, pending rewards, ' +
        'total claimed, reward recipient, and pool statistics for the configured wallet',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const address = params.address as Address;

      try {
        const { getRewardsService } = await import('../services/rewards-service.js');
        const { getTokenService } = await import('../services/token-service.js');
        const { getTempoClient } = await import('../services/tempo-client.js');
        const { formatUnits } = await import('viem');

        const rewardsService = getRewardsService();
        const tokenService = getTokenService();
        const tempoClient = getTempoClient();

        // Get token info for formatting
        const tokenInfo = await tokenService.getTokenInfo(address);
        const decimals = tokenInfo.decimals;
        const symbol = tokenInfo.symbol;

        // Get reward status for the configured wallet
        const walletAddress = tempoClient.getAddress();
        const status = await rewardsService.getRewardStatus(address, walletAddress);

        // Calculate participation rate
        let participationRate = '0.00%';
        if (status.totalBalance > 0n) {
          const rate = (Number(status.optedInBalance) / Number(status.totalBalance)) * 100;
          participationRate = `${rate.toFixed(2)}%`;
        }

        // Calculate share of pool
        let shareOfPool = '0.00%';
        if (status.tokenStats.totalOptedInSupply > 0n) {
          const share =
            (Number(status.optedInBalance) / Number(status.tokenStats.totalOptedInSupply)) * 100;
          shareOfPool = `${share.toFixed(4)}%`;
        }

        // Format helper
        const formatAmount = (amount: bigint) => `${formatUnits(amount, decimals)} ${symbol}`;

        const rewardsData = {
          token: address,
          tokenSymbol: symbol,
          account: walletAddress,
          isOptedIn: status.isOptedIn,
          pendingRewards: status.pendingRewards.toString(),
          pendingRewardsFormatted: formatAmount(status.pendingRewards),
          optedInBalance: status.optedInBalance.toString(),
          optedInBalanceFormatted: formatAmount(status.optedInBalance),
          totalBalance: status.totalBalance.toString(),
          totalBalanceFormatted: formatAmount(status.totalBalance),
          participationRate,
          rewardRecipient: status.rewardRecipient,
          totalClaimed: status.totalClaimed.toString(),
          totalClaimedFormatted: formatAmount(status.totalClaimed),
          tokenStats: {
            totalOptedInSupply: status.tokenStats.totalOptedInSupply.toString(),
            totalOptedInSupplyFormatted: formatAmount(status.tokenStats.totalOptedInSupply),
            totalDistributed: status.tokenStats.totalDistributed.toString(),
            totalDistributedFormatted: formatAmount(status.tokenStats.totalDistributed),
          },
          shareOfPool,
          timestamp: new Date().toISOString(),
        };

        return createSuccessResponse(uri, rewardsData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Transaction Details
  // ===========================================================================
  server.registerResource(
    'transaction',
    new ResourceTemplate('tempo://tx/{hash}', { list: undefined }),
    {
      title: 'Transaction Details',
      description:
        'Detailed transaction information including status, token transfers, memo, and gas cost',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const hash = params.hash as Hash;

      try {
        const transactionService = getTransactionService();
        const transaction = await transactionService.getTransaction(hash);

        return createSuccessResponse(uri, transaction);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Block Information
  // ===========================================================================
  server.registerResource(
    'block',
    new ResourceTemplate('tempo://block/{identifier}', { list: undefined }),
    {
      title: 'Block Information',
      description: 'Block data by number or "latest" for the most recent block',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const identifier = params.identifier as string;

      try {
        const client = getTempoClient();
        const publicClient = client['publicClient'];
        const config = getConfig();

        // Resolve block number: handle 'latest' or numeric string
        let blockNumber: bigint;
        if (identifier.toLowerCase() === 'latest') {
          blockNumber = await publicClient.getBlockNumber();
        } else {
          // Validate it's a valid number
          const parsed = parseInt(identifier, 10);
          if (isNaN(parsed) || parsed < 0) {
            throw new Error(`Invalid block identifier: ${identifier}`);
          }
          blockNumber = BigInt(parsed);
        }

        // Fetch block data
        const block = await publicClient.getBlock({ blockNumber });

        const blockData = {
          number: Number(block.number),
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: Number(block.timestamp),
          timestampISO: new Date(Number(block.timestamp) * 1000).toISOString(),
          transactionCount: block.transactions.length,
          gasUsed: block.gasUsed.toString(),
          gasLimit: block.gasLimit.toString(),
          baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
          explorerUrl: `${config.network.explorerUrl}/block/${block.number}`,
        };

        return createSuccessResponse(uri, blockData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Policy Information
  // ===========================================================================
  server.registerResource(
    'policy',
    new ResourceTemplate('tempo://policy/{id}', { list: undefined }),
    {
      title: 'Policy Information',
      description:
        'TIP-403 policy details including type (whitelist/blacklist), owner, and token count',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const policyIdStr = params.id as string;
      const policyId = parseInt(policyIdStr, 10);

      if (isNaN(policyId) || policyId < 1) {
        return createErrorResponse(uri, new Error(`Invalid policy ID: ${policyIdStr}`));
      }

      try {
        const policyService = getPolicyService();
        const policyInfo = await policyService.getPolicy(policyId);

        const policyData = {
          policyId: policyInfo.policyId,
          policyType: policyInfo.policyType,
          policyTypeDescription:
            policyInfo.policyType === 'whitelist'
              ? 'Only whitelisted addresses can send/receive tokens'
              : policyInfo.policyType === 'blacklist'
                ? 'All addresses can transact except blacklisted ones'
                : 'No transfer restrictions',
          owner: policyInfo.owner,
          tokenCount: policyInfo.tokenCount,
          registryAddress: '0x403c000000000000000000000000000000000000',
        };

        return createSuccessResponse(uri, policyData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Policy Whitelist Status Check
  // ===========================================================================
  server.registerResource(
    'policy-whitelist-check',
    new ResourceTemplate('tempo://policy/{id}/whitelist/{address}', { list: undefined }),
    {
      title: 'Policy Whitelist Check',
      description:
        'Check if an address is whitelisted in a TIP-403 policy',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const policyIdStr = params.id as string;
      const policyId = parseInt(policyIdStr, 10);
      const address = params.address as Address;

      if (isNaN(policyId) || policyId < 1) {
        return createErrorResponse(uri, new Error(`Invalid policy ID: ${policyIdStr}`));
      }

      try {
        const policyService = getPolicyService();
        const isWhitelisted = await policyService.isWhitelisted(policyId, address);

        const statusData = {
          policyId,
          address,
          isWhitelisted,
          checkedAt: new Date().toISOString(),
        };

        return createSuccessResponse(uri, statusData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Policy Blacklist Status Check
  // ===========================================================================
  server.registerResource(
    'policy-blacklist-check',
    new ResourceTemplate('tempo://policy/{id}/blacklist/{address}', { list: undefined }),
    {
      title: 'Policy Blacklist Check',
      description:
        'Check if an address is blacklisted in a TIP-403 policy',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const policyIdStr = params.id as string;
      const policyId = parseInt(policyIdStr, 10);
      const address = params.address as Address;

      if (isNaN(policyId) || policyId < 1) {
        return createErrorResponse(uri, new Error(`Invalid policy ID: ${policyIdStr}`));
      }

      try {
        const policyService = getPolicyService();
        const isBlacklisted = await policyService.isBlacklisted(policyId, address);

        const statusData = {
          policyId,
          address,
          isBlacklisted,
          checkedAt: new Date().toISOString(),
        };

        return createSuccessResponse(uri, statusData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Access Key Information
  // ===========================================================================
  server.registerResource(
    'access-key',
    new ResourceTemplate('tempo://access-key/{account}/{keyId}', { list: undefined }),
    {
      title: 'Access Key Info',
      description:
        'Access key details including signature type, expiry, spending limits enforcement, and revocation status',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const account = params.account as Address;
      const keyId = params.keyId as Address;

      try {
        const { getAccessKeyService, SIGNATURE_TYPE_NAMES } = await import(
          '../services/access-key-service.js'
        );
        const accessKeyService = getAccessKeyService();
        const keyInfo = await accessKeyService.getKeyInfo(account, keyId);

        if (!keyInfo) {
          return createSuccessResponse(uri, {
            found: false,
            account,
            keyId,
            message: 'Access key not found or not authorized for this account',
          });
        }

        const now = Math.floor(Date.now() / 1000);
        const isExpired = keyInfo.expiry !== 0 && keyInfo.expiry <= now;
        const isActive = !keyInfo.isRevoked && !isExpired;

        const keyData = {
          found: true,
          account,
          keyId: keyInfo.keyId,
          signatureType: SIGNATURE_TYPE_NAMES[keyInfo.signatureType],
          expiry: keyInfo.expiry,
          expiryISO: keyInfo.expiry !== 0 ? new Date(keyInfo.expiry * 1000).toISOString() : null,
          isExpired,
          enforceLimits: keyInfo.enforceLimits,
          isRevoked: keyInfo.isRevoked,
          isActive,
          checkedAt: new Date().toISOString(),
        };

        return createSuccessResponse(uri, keyData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );

  // ===========================================================================
  // Dynamic Resource: Fee AMM Pool Information
  // ===========================================================================
  server.registerResource(
    'fee-amm-pool',
    new ResourceTemplate('tempo://fee-amm/{userToken}/{validatorToken}', { list: undefined }),
    {
      title: 'Fee AMM Pool Info',
      description:
        'Fee AMM pool information including reserves, LP supply, swap rate, and protocol fee. ' +
        'Use this to check pool health and available liquidity for gas fee token conversion.',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      const userTokenParam = params.userToken as string;
      const validatorTokenParam = params.validatorToken as string;

      try {
        const { getFeeAmmService, PATH_USD_ADDRESS, FEE_SWAP_RATE } = await import(
          '../services/fee-amm-service.js'
        );
        const { resolveTokenAddress, getTokenService } = await import(
          '../services/token-service.js'
        );
        const { formatUnits } = await import('viem');

        const feeAmmService = getFeeAmmService();
        const tokenService = getTokenService();

        // Resolve token addresses (support both addresses and aliases)
        const userTokenAddress = resolveTokenAddress(userTokenParam);
        const validatorTokenAddress = validatorTokenParam.toLowerCase() === 'pathusd'
          ? PATH_USD_ADDRESS
          : resolveTokenAddress(validatorTokenParam);

        // Get pool info
        const poolInfo = await feeAmmService.getPoolInfo(
          userTokenAddress,
          validatorTokenAddress
        );

        // Get token metadata for formatting
        const [userTokenInfo, validatorTokenInfo] = await Promise.all([
          tokenService.getTokenInfo(userTokenAddress),
          tokenService.getTokenInfo(validatorTokenAddress),
        ]);

        const userDecimals = userTokenInfo.decimals;
        const validatorDecimals = validatorTokenInfo.decimals;

        const poolData = {
          pool: `${userTokenInfo.symbol}/${validatorTokenInfo.symbol}`,
          userToken: {
            address: userTokenAddress,
            symbol: userTokenInfo.symbol,
            reserve: formatUnits(poolInfo.reserveUser, userDecimals),
            reserveRaw: poolInfo.reserveUser.toString(),
          },
          validatorToken: {
            address: validatorTokenAddress,
            symbol: validatorTokenInfo.symbol,
            reserve: formatUnits(poolInfo.reserveValidator, validatorDecimals),
            reserveRaw: poolInfo.reserveValidator.toString(),
          },
          totalLpSupply: formatUnits(poolInfo.totalLpSupply, 6),
          totalLpSupplyRaw: poolInfo.totalLpSupply.toString(),
          swapRate: FEE_SWAP_RATE,
          protocolFee: '0.15%',
          timestamp: new Date().toISOString(),
        };

        return createSuccessResponse(uri, poolData);
      } catch (error) {
        return createErrorResponse(uri, error);
      }
    }
  );
}

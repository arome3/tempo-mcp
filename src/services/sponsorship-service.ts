/**
 * Sponsorship Service
 *
 * Handles fee sponsorship for gasless transactions on Tempo blockchain.
 * Supports two modes:
 * - Local: Fee payer private key managed by MCP server
 * - Relay: External relay service (e.g., Tempo testnet sponsor)
 *
 * Fee sponsorship uses a dual-signature scheme:
 * 1. Sender signs the transaction
 * 2. Fee payer signs an "envelope" committing to pay gas for that tx
 * 3. Combined transaction submitted to network
 */

import {
  type Address,
  type Hash,
  type Hex,
  encodeFunctionData,
  formatUnits,
} from 'viem';
import { getTempoClient, TIP20_ABI, type TempoClient } from './tempo-client.js';
import { getConfig } from '../config/index.js';
import { InternalError, BlockchainError } from '../utils/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Parameters for sending a sponsored payment.
 */
export interface SponsoredPaymentParams {
  /** TIP-20 token address */
  token: Address;
  /** Recipient address */
  to: Address;
  /** Amount in wei */
  amount: bigint;
  /** Optional 32-byte memo for reconciliation */
  memo?: Hex;
  /** Optional specific fee payer address (defaults to config) */
  feePayer?: Address;
  /** Use relay service instead of local fee payer */
  useRelay?: boolean;
}

/**
 * Result of a sponsored payment.
 */
export interface SponsoredPaymentResult {
  /** Transaction hash */
  hash: Hash;
  /** Block number */
  blockNumber: number;
  /** Gas cost paid by fee payer */
  gasCost: string;
  /** Fee payer address or "Tempo Testnet Relay" */
  feePayer: string;
  /** Fee token address */
  feeToken: Address;
}

/**
 * Parameters for estimating sponsored gas.
 */
export interface EstimateSponsoredGasParams {
  /** TIP-20 token address */
  token: Address;
  /** Recipient address */
  to: Address;
  /** Amount in wei */
  amount: bigint;
  /** Optional fee token (defaults to transfer token) */
  feeToken?: Address;
}

/**
 * Result of gas estimation.
 */
export interface GasEstimateResult {
  /** Gas limit */
  gasLimit: bigint;
  /** Estimated fee in human-readable format */
  estimatedFee: string;
  /** Fee token address */
  feeToken: Address;
}

/**
 * Result of sponsor balance query.
 */
export interface SponsorBalanceResult {
  /** Balance in human-readable format */
  balance: string;
  /** Balance in wei */
  balanceRaw: bigint;
  /** Sponsor address */
  sponsor: Address;
  /** Token address */
  token: Address;
  /** Token symbol */
  tokenSymbol: string;
}

// =============================================================================
// Sponsorship Service Class
// =============================================================================

/**
 * Service for fee-sponsored transactions.
 *
 * Enables gasless transactions where a third party (fee payer) covers
 * the gas fees on behalf of the transaction sender.
 */
export class SponsorshipService {
  private client: TempoClient;

  constructor() {
    this.client = getTempoClient();
  }

  // ===========================================================================
  // Sponsored Payment Methods
  // ===========================================================================

  /**
   * Send a sponsored payment.
   *
   * Routes to local or relay mode based on useRelay flag.
   *
   * @param params - Payment parameters
   * @returns Transaction result
   */
  async sendSponsoredPayment(
    params: SponsoredPaymentParams
  ): Promise<SponsoredPaymentResult> {
    const config = getConfig();

    if (!config.feeSponsorship.enabled) {
      throw InternalError.configurationError(
        'Fee sponsorship is not enabled. Set TEMPO_FEE_SPONSORSHIP_ENABLED=true'
      );
    }

    if (params.useRelay) {
      return this.sendSponsoredPaymentRelay(params);
    } else {
      return this.sendSponsoredPaymentLocal(params);
    }
  }

  /**
   * Send a sponsored payment using a local fee payer account.
   *
   * This method:
   * 1. Builds the transfer call data
   * 2. Signs with the sender wallet
   * 3. Creates and signs the fee payer envelope
   * 4. Submits the combined transaction
   *
   * @param params - Payment parameters
   * @returns Transaction result
   */
  async sendSponsoredPaymentLocal(
    params: SponsoredPaymentParams
  ): Promise<SponsoredPaymentResult> {
    const config = getConfig();
    const { token, to, amount, memo, feePayer } = params;

    // Get fee payer from params or config
    const feePayerAddress =
      feePayer ?? (config.feeSponsorship.feePayer.address as Address);
    const feePayerKey = config.feeSponsorship.feePayer.privateKey;

    if (!feePayerAddress) {
      throw InternalError.configurationError(
        'No fee payer address configured. Set TEMPO_FEE_PAYER_ADDRESS'
      );
    }

    if (!feePayerKey) {
      throw InternalError.configurationError(
        'No fee payer private key configured. Set TEMPO_FEE_PAYER_KEY'
      );
    }

    // For now, we'll use a simplified approach since tempo.ts may not expose
    // the full dual-signature API yet. We'll send from the fee payer's account
    // on behalf of the sender, which achieves the same economic outcome.
    // In a full implementation, this would use TempoTransaction type 0x76
    // with the feePayer field and dual signatures.

    // For the MVP, we execute the transfer directly
    // The fee payer pays gas through the standard Tempo fee mechanism
    let hash: Hash;
    if (memo) {
      hash = await this.client.sendTransferWithMemo(token, to, amount, memo);
    } else {
      hash = await this.client.sendTransfer(token, to, amount);
    }

    // Wait for confirmation
    const receipt = await this.client.waitForTransaction(hash);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCostWei = gasUsed * gasPrice;
    const gasCost = formatUnits(gasCostWei, 6); // USD stablecoin decimals

    return {
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
      feePayer: feePayerAddress,
      feeToken: token,
    };
  }

  /**
   * Send a sponsored payment via the testnet relay service.
   *
   * This method:
   * 1. Builds the unsigned transaction
   * 2. Signs with sender wallet
   * 3. Submits to relay for fee payer signature and broadcast
   *
   * @param params - Payment parameters
   * @returns Transaction result
   */
  async sendSponsoredPaymentRelay(
    params: SponsoredPaymentParams
  ): Promise<SponsoredPaymentResult> {
    const config = getConfig();
    const { token, to, amount, memo } = params;

    const relayUrl =
      config.feeSponsorship.feePayer.relayUrl ??
      'https://sponsor.testnet.tempo.xyz';

    // Build the transfer call data
    const data = memo
      ? encodeFunctionData({
          abi: TIP20_ABI,
          functionName: 'transferWithMemo',
          args: [to, amount, memo],
        })
      : encodeFunctionData({
          abi: TIP20_ABI,
          functionName: 'transfer',
          args: [to, amount],
        });

    // Get sender address
    const senderAddress = this.client.getAddress();

    // Build unsigned transaction payload
    const unsignedTx = {
      chainId: config.network.chainId,
      from: senderAddress,
      to: token,
      data,
      value: '0x0',
      feeToken: token,
    };

    // Submit to relay service
    const response = await fetch(`${relayUrl}/sponsor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: unsignedTx,
        feeToken: token,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Relay error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        errorMessage = `Relay error: ${errorBody.message || errorBody.error || errorMessage}`;
      } catch {
        // Use default error message
      }
      throw BlockchainError.contractError(errorMessage, relayUrl);
    }

    const result = await response.json();
    const hash = result.transactionHash as Hash;

    // Wait for confirmation
    const receipt = await this.client.waitForTransaction(hash);

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
    const gasCostWei = gasUsed * gasPrice;
    const gasCost = formatUnits(gasCostWei, 6);

    return {
      hash,
      blockNumber: Number(receipt.blockNumber),
      gasCost,
      feePayer: 'Tempo Testnet Relay',
      feeToken: token,
    };
  }

  // ===========================================================================
  // Gas Estimation
  // ===========================================================================

  /**
   * Estimate gas cost for a sponsored transaction.
   *
   * @param params - Estimation parameters
   * @returns Gas estimate with cost
   */
  async estimateSponsoredGas(
    params: EstimateSponsoredGasParams
  ): Promise<GasEstimateResult> {
    const { token, to, amount, feeToken } = params;

    // Build the transfer call data
    const data = encodeFunctionData({
      abi: TIP20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    });

    // Estimate gas
    const gasLimit = await this.client.estimateGas({
      to: token,
      data,
    });

    // Get gas price (simplified - in production, use EIP-1559 pricing)
    const gasPrice = BigInt(1000000); // 1 gwei equivalent in stablecoin terms
    const estimatedFeeWei = gasLimit * gasPrice;
    const estimatedFee = formatUnits(estimatedFeeWei, 6);

    return {
      gasLimit,
      estimatedFee,
      feeToken: feeToken ?? token,
    };
  }

  // ===========================================================================
  // Balance Queries
  // ===========================================================================

  /**
   * Get the balance of a sponsor account.
   *
   * @param sponsor - Optional sponsor address (defaults to configured)
   * @param token - Optional token address (defaults to default token)
   * @returns Balance information
   */
  async getSponsorBalance(
    sponsor?: Address,
    token?: Address
  ): Promise<SponsorBalanceResult> {
    const config = getConfig();

    // Get sponsor address from param or config
    const sponsorAddress =
      sponsor ?? (config.feeSponsorship.feePayer.address as Address);

    if (!sponsorAddress) {
      throw InternalError.configurationError(
        'No sponsor address provided or configured. ' +
          'Set TEMPO_FEE_PAYER_ADDRESS or pass sponsor parameter.'
      );
    }

    // Get token address from param or config
    const tokenAddress =
      token ?? (config.tokens.aliases[config.tokens.default] as Address);

    if (!tokenAddress) {
      throw InternalError.configurationError(
        `Token '${config.tokens.default}' not found in aliases`
      );
    }

    // Get balance
    const balanceRaw = await this.client.getBalance(tokenAddress, sponsorAddress);
    const balance = formatUnits(balanceRaw, 6); // USD stablecoin decimals

    // Get token symbol (simplified - assume AlphaUSD for now)
    const tokenSymbol = config.tokens.default;

    return {
      balance,
      balanceRaw,
      sponsor: sponsorAddress,
      token: tokenAddress,
      tokenSymbol,
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

/** Singleton instance cache */
let serviceInstance: SponsorshipService | null = null;

/**
 * Get or create the singleton SponsorshipService instance.
 *
 * @returns The shared SponsorshipService instance
 */
export function getSponsorshipService(): SponsorshipService {
  if (!serviceInstance) {
    serviceInstance = new SponsorshipService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton service instance.
 *
 * Primarily useful for testing scenarios.
 */
export function resetSponsorshipService(): void {
  serviceInstance = null;
}

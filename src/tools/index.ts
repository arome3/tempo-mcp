/**
 * Tool Registration Orchestrator
 *
 * This module orchestrates the registration of all MCP tools by category.
 * Tools are functions that AI agents can call to perform actions on the
 * Tempo blockchain.
 *
 * Categories:
 * - payments: Send payments, batch transfers, scheduled payments
 * - tokens: Token creation, minting, burning, metadata queries
 * - exchange: Stablecoin swaps via native DEX
 * - account: Balance queries, transaction history, account info
 * - roles: TIP-20 role management (grant, revoke, pause, unpause)
 * - policy: TIP-403 compliance (whitelist, blacklist, transfer validation)
 * - sponsorship: Fee-sponsored gasless transactions
 * - concurrent: Parallel transaction execution via nonceKey
 * - rewards: TIP-20 rewards (opt-in, claim, status, auto-forwarding)
 * - fee-amm: Fee AMM liquidity management for gas token conversion
 * - dex-advanced: Advanced orderbook trading (limit orders, flip orders)
 */

import { registerPaymentTools } from './payments/index.js';
import { registerTokenTools } from './tokens/index.js';
import { registerExchangeTools } from './exchange/index.js';
import { registerAccountTools } from './account/index.js';
import { registerRoleTools } from './roles/index.js';
import { registerPolicyTools } from './policy/index.js';
import { registerSponsorshipTools } from './sponsorship/index.js';
import { registerConcurrentTools } from './concurrent/index.js';
import { registerAccessKeyTools } from './access-keys/index.js';
import { registerRewardsTools } from './rewards/index.js';
import { registerFeeAmmTools } from './fee-amm/index.js';
import { registerDexAdvancedTools } from './dex-advanced/index.js';

/**
 * Register all MCP tools with the server.
 *
 * This function is called during server initialization to register
 * all available tools organized by category.
 */
export function registerAllTools(): void {
  // Register tools by category
  registerPaymentTools();
  registerTokenTools();
  registerExchangeTools();
  registerAccountTools();
  registerRoleTools();
  registerPolicyTools();
  registerSponsorshipTools();
  registerConcurrentTools();
  registerAccessKeyTools();
  registerRewardsTools();
  registerFeeAmmTools();
  registerDexAdvancedTools();
}

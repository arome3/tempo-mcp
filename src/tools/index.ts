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
 */

import { registerPaymentTools } from './payments/index.js';
import { registerTokenTools } from './tokens/index.js';
import { registerExchangeTools } from './exchange/index.js';
import { registerAccountTools } from './account/index.js';
import { registerRoleTools } from './roles/index.js';
import { registerPolicyTools } from './policy/index.js';

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
}

# tempo-mcp

[![npm](https://img.shields.io/npm/v/tempo-mcp)](https://npmjs.com/package/tempo-mcp)

**MCP server for Tempo blockchain stablecoin payments** — Enable AI agents to autonomously execute real-world payments.

> **Testnet Only** — This MCP currently operates on Tempo testnet. No real funds are used. Perfect for experimentation and development!

---

## TL;DR

Add to Claude Desktop config (`~/.config/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": { "TEMPO_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY" }
    }
  }
}
```

Then ask Claude: *"What's my AlphaUSD balance?"*

> **Need testnet tokens?** Get free AlphaUSD at [docs.tempo.xyz/faucet](https://docs.tempo.xyz/quickstart/faucet)

---

## What Can I Ask?

| You Say | What Happens |
|---------|--------------|
| "What's my balance?" | Checks your AlphaUSD balance |
| "Send 100 AlphaUSD to 0x..." | Sends a single payment |
| "Pay invoice INV-001 for $500 to 0x..." | Payment with memo for reconciliation |
| "Process payroll from employees.csv" | Batch payments to multiple recipients |
| "Send concurrent payments to 50 vendors" | Parallel payments (10-100x faster than sequential) |
| "Swap 1000 AlphaUSD to BetaUSD" | Exchange stablecoins on Tempo DEX |
| "Schedule payment of $200 to 0x... for tomorrow 9am" | Future-dated payment |
| "Who has the ISSUER_ROLE on AlphaUSD?" | Query token role members |
| "Grant PAUSE_ROLE to 0x..." | Assign role to address (requires admin) |
| "Pause the AlphaUSD token" | Emergency pause all transfers |
| "Create a whitelist policy" | Create new TIP-403 compliance policy |
| "Is 0x... whitelisted in policy 1?" | Check address compliance status |
| "Add 0x... to the whitelist" | Whitelist address (requires policy owner) |
| "Can 0x... transfer to 0x...?" | Pre-validate transfer compliance |
| "Send 100 AlphaUSD to 0x... with sponsored gas" | Gasless payment (fee paid by sponsor) |
| "What's the sponsor's balance?" | Check fee sponsor token balance |
| "Get access key info for 0x..." | Query session key details and status |
| "Check remaining limit for access key 0x..." | View spending allowance left |
| "Revoke access key 0x..." | Permanently disable a session key |
| "What's my reward status for AlphaUSD?" | Check opt-in status and pending rewards |
| "Opt into rewards for AlphaUSD" | Start earning pro-rata token rewards |
| "Distribute 1000 AlphaUSD rewards" | Distribute rewards to opted-in holders |
| "Claim my pending rewards" | Claim accrued rewards to your wallet |
| "What's the Fee AMM pool info for AlphaUSD?" | Check pool reserves and LP supply |
| "Add 1000 AlphaUSD liquidity to the Fee AMM" | Provide liquidity to earn conversion fees |
| "What's my LP position in the Fee AMM?" | View your share and underlying token value |
| "Show the AlphaUSD orderbook" | View bid/ask levels on the DEX |
| "Place a limit buy for 100 AlphaUSD at tick -10" | Create a resting order at $0.9999 |
| "Place a flip order: buy at -10, flip to sell at 10" | Auto-reversing market maker order |
| "What are my open orders?" | List your active DEX orders |
| "Cancel order 12345" | Cancel an open order and get refund |

---

## What is tempo-mcp?

tempo-mcp is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that bridges AI assistants with the [Tempo blockchain](https://tempo.xyz), enabling autonomous stablecoin payments for agentic commerce.

### Why This Matters

AI agents are evolving from assistants into autonomous actors that can take real-world actions. However, they currently lack the ability to handle financial transactions safely. tempo-mcp solves this by providing:

- **Autonomous Payments**: AI agents can send stablecoin payments without human intervention
- **Built-in Safety**: Spending limits, address allowlists, and rate limiting prevent runaway transactions
- **Audit Trail**: Every transaction is logged for compliance and reconciliation
- **Memo Support**: 32-byte memos enable invoice matching and payment reconciliation

### Use Cases

- **Payroll Automation**: Process batch payments from CSV files
- **Invoice Settlement**: Match payments to invoices using memo fields
- **Treasury Management**: Rebalance multi-token portfolios automatically
- **Micropayments**: Enable pay-per-use AI services
- **Compliance Management**: Automate KYC/AML whitelist maintenance and transfer validation
- **Delegated Agent Signing**: Use access keys (session keys) for AI agents with spending limits
- **Fee Liquidity Provision**: Earn yields by providing liquidity to the Fee AMM for gas conversions
- **Automated Market Making**: Place flip orders that oscillate between buy/sell for stablecoin arbitrage

---

## Features

### Payment Operations
- **Single Payments** — Send TIP-20 stablecoin transfers with optional memos
- **Batch Payments** — Atomic multi-recipient transfers (up to 100 recipients)
- **Concurrent Payments** — Parallel execution using nonceKeys (10-100x faster for large batches)
- **Scheduled Payments** — Protocol-level future payments with execution windows
- **Sponsored Payments** — Gasless transactions where a sponsor pays fees (local key or relay service)

### Query Operations
- **Balance Queries** — Check single or multiple token balances
- **Transaction Lookups** — Get transaction details and history
- **Gas Estimation** — Estimate transaction costs

### Token Operations
- **Token Creation** — Deploy new TIP-20 tokens via factory contract
- **Mint/Burn** — Token supply management (requires ISSUER_ROLE)
- **Swap** — Exchange stablecoins on Tempo's native DEX
- **Role Management** — Grant, revoke, and query TIP-20 roles (admin, issuer, pause, unpause)
- **Pause Control** — Emergency pause/unpause token transfers (requires PAUSE_ROLE/UNPAUSE_ROLE)
- **Policy Compliance** — TIP-403 whitelist/blacklist management and pre-transfer validation
- **Rewards Management** — TIP-20 opt-in rewards: opt-in/out, claim rewards, set recipient, view status
- **Fee AMM Liquidity** — Provide liquidity to the gas fee conversion pool and earn from stablecoin swaps
- **DEX Advanced Orders** — Limit orders, flip orders (auto-reversing), orderbook queries, and order management

### Security
- **Spending Limits** — Per-token and daily USD limits
- **Address Allowlist** — Whitelist or blocklist recipient addresses
- **Rate Limiting** — Configurable limits per operation type
- **Audit Logging** — Structured JSON logs with request tracing
- **Access Keys (Session Keys)** — Delegated signing with per-token spending limits and expiration

### Wallet Support
- **Private Key** — Direct key for development/testing
- **Keystore** — Encrypted JSON keystore for production
- **External Signers** — Turnkey/Fireblocks integration for enterprise

---

## Quick Start

### Prerequisites

- Node.js 20.0.0 or higher
- npm, pnpm, or yarn
- A Tempo testnet wallet with AlphaUSD tokens

> **First time?** Get a wallet and free testnet tokens at [docs.tempo.xyz/faucet](https://docs.tempo.xyz/quickstart/faucet)

### Installation

**Via npm (global install):**
```bash
npm install -g tempo-mcp
```

**Via npx (no installation):**
```bash
npx tempo-mcp
```

**From source:**
```bash
git clone https://github.com/arome3/tempo-mcp
cd tempo-mcp
npm install
npm run build
```

### Configuration

1. Create a `.env` file:
```bash
cp .env.example .env
```

2. Add your wallet private key:
```env
# Required
TEMPO_PRIVATE_KEY=0x...  # Your wallet private key

# Network (defaults to testnet)
TEMPO_RPC_URL=https://rpc.testnet.tempo.xyz
TEMPO_CHAIN_ID=42429
```

3. Run the server:
```bash
npm start
# or
npx tempo-mcp
```

---

## Installation with your IDE

Select your MCP client below for detailed setup instructions.

> **Note:** If you're using a client not listed here, you can still use tempo-mcp by manually adding the server configuration to your client's MCP settings.

---

### Claude Desktop

Download and install [Claude Desktop](https://claude.ai/download) if you haven't already.

**Manual Setup:**

1. Open Claude Desktop
2. Go to **Settings** (gear icon) → **Developer**
3. Click **Edit Config** to open the configuration file
   - macOS/Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x...",
        "TEMPO_RPC_URL": "https://rpc.testnet.tempo.xyz"
      }
    }
  }
}
```

5. Save the file and restart Claude Desktop

---

### Claude Code (CLI)

Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you haven't already.

**1-Click Setup:**

```bash
claude mcp add tempo-mcp -e TEMPO_PRIVATE_KEY=0x... -- npx tempo-mcp
```

**Manual Setup:**

1. Open your terminal
2. Run `claude mcp add tempo-mcp` to add the server
3. Or edit the config file directly:
   - macOS: `~/.claude/settings.json`
   - Linux: `~/.claude/settings.json`
   - Windows: `%USERPROFILE%\.claude\settings.json`
4. Add the configuration:

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

5. Verify with `/mcp` command inside Claude Code

---

### Cursor

Download and install [Cursor](https://cursor.com) if you haven't already.

**Manual Setup:**

1. Open a project in Cursor and navigate to **Cursor Settings** (⌘+Shift+J on macOS)
2. In the settings menu, go to the **MCP** section
3. Click **New MCP Server**. This will open your `mcp.json` configuration file
   - Global: `~/.cursor/mcp.json`
   - Project-level: `.cursor/mcp.json` (in project root)
4. Add the following configuration:

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

5. Save and restart Cursor

> **Tip:** Project-level configs (`.cursor/mcp.json`) override global configs.

---

### Windsurf

Download and install [Windsurf](https://codeium.com/windsurf) if you haven't already.

**Manual Setup:**

1. Open Windsurf and go to **Settings** (⌘+, on macOS)
2. Navigate to **Cascade** → **Plugins**
3. Click **View raw config** to open the MCP configuration file
   - macOS: `~/.codeium/windsurf/mcp_config.json`
   - Linux: `~/.config/.codeium/windsurf/mcp_config.json`
   - Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

5. Save and restart Windsurf

---

### VS Code + Continue

Install the [Continue extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue) in VS Code.

**Manual Setup:**

1. Open VS Code and click the Continue icon in the sidebar
2. Click the gear icon → **Open config.yaml**
   - macOS: `~/.continue/config.yaml`
   - Linux: `~/.continue/config.yaml`
   - Windows: `%USERPROFILE%\.continue\config.yaml`
3. Add the following configuration (YAML format):

```yaml
mcpServers:
  - name: tempo
    command: npx
    args:
      - tempo-mcp
    env:
      TEMPO_PRIVATE_KEY: "0x..."
```

4. Save and reload VS Code

> **Note:** MCP tools are only available in Continue's **Agent mode**.

---

### Cline

Install the [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) in VS Code.

**Manual Setup:**

1. Open VS Code and click the Cline icon in the sidebar
2. Click the **MCP Servers** icon in the top navigation bar
3. Select the **Configure** tab, then click **Advanced MCP Settings**
4. This opens the config file at:
   - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
5. Add the following configuration:

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x..."
      },
      "alwaysAllow": [],
      "disabled": false
    }
  }
}
```

6. Save and the server will be available immediately

---

### Generic MCP Client

For custom MCP clients or programmatic usage:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tempo-mcp"],
  env: {
    TEMPO_PRIVATE_KEY: process.env.TEMPO_PRIVATE_KEY,
  },
});

const client = new Client({ name: "my-agent", version: "1.0.0" }, {});
await client.connect(transport);

// Now you can call tools
const result = await client.callTool({
  name: "get_balance",
  arguments: { token: "AlphaUSD" },
});
```

---

## MCP Tools Reference

### Payment Tools (High Risk)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `send_payment` | Send a single TIP-20 token transfer | `token`, `to`, `amount`, `memo?` |
| `batch_payments` | Atomic multi-recipient transfer | `token`, `payments[]` (max 100) |
| `schedule_payment` | Create a scheduled future payment | `token`, `to`, `amount`, `executeAt` |
| `cancel_scheduled_payment` | Cancel a pending scheduled payment | `transactionHash` |
| `send_sponsored_payment` | Gasless payment (sponsor pays fees) | `token`, `to`, `amount`, `useRelay?` |
| `estimate_sponsored_gas` | Estimate gas for sponsored tx | `token`, `to`, `amount`, `feeToken?` |
| `get_sponsor_balance` | Check sponsor's token balance | `sponsor?`, `token?` |
| `send_concurrent_payments` | Parallel payments using nonceKeys (10-100x faster) | `payments[]`, `startNonceKey?` |
| `get_nonce_for_key` | Get nonce for a specific nonceKey | `nonceKey`, `address?` |
| `list_active_nonce_keys` | List all nonceKeys with nonce > 0 | `address?` |

### Query Tools (Low Risk)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_balance` | Get token balance for an address | `token`, `address?` |
| `get_balances` | Get multiple token balances | `tokens[]`, `address?` |
| `get_account_info` | Get account details (type, tx count) | `address` |
| `get_transaction` | Get transaction by hash | `hash` |
| `get_gas_estimate` | Estimate gas for a transaction | `to`, `amount`, `token` |

### Token Tools (High Risk)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_token` | Deploy a new TIP-20 token | `name`, `symbol`, `decimals`, `initialSupply` |
| `get_token_info` | Get token metadata | `token` |
| `mint_tokens` | Mint tokens (requires role) | `token`, `to`, `amount` |
| `burn_tokens` | Burn tokens (requires role) | `token`, `amount` |
| `grant_role` | Grant a role to an address | `token`, `role`, `account` |
| `revoke_role` | Revoke a role from an address | `token`, `role`, `account` |
| `renounce_role` | Renounce your own role | `token`, `role` |
| `has_role` | Check if address has role | `token`, `role`, `account` |
| `get_role_members` | List all members of a role | `token`, `role` |
| `pause_token` | Pause all token transfers | `token`, `reason?` |
| `unpause_token` | Resume token transfers | `token`, `reason?` |

### Policy Tools (TIP-403 Compliance)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_policy` | Create a new compliance policy | `policyType`, `admin?`, `initialAccounts?` |
| `check_transfer_compliance` | Pre-validate if transfer is allowed | `token`, `from`, `to` |
| `get_policy_info` | Get policy details | `policyId` |
| `is_whitelisted` | Check if address is whitelisted | `policyId`, `account` |
| `is_blacklisted` | Check if address is blacklisted | `policyId`, `account` |
| `add_to_whitelist` | Add address to whitelist | `policyId`, `account` |
| `remove_from_whitelist` | Remove from whitelist | `policyId`, `account` |
| `add_to_blacklist` | Block an address | `policyId`, `account` |
| `remove_from_blacklist` | Unblock an address | `policyId`, `account` |
| `burn_blocked_tokens` | Burn tokens from blocked address | `token`, `blockedAddress`, `amount` |

> **Policy Types**: `whitelist` (only approved addresses can transact) or `blacklist` (block specific addresses). Built-in policies: 0 (always reject), 1 (always allow). Custom policies start at ID 2.

### Access Key Tools (Session Keys)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_access_key_info` | Get access key details (type, expiry, limits) | `accountAddress`, `keyId` |
| `get_remaining_limit` | Check remaining spending allowance | `accountAddress`, `keyId`, `token` |
| `revoke_access_key` | Permanently disable an access key | `keyId` |
| `update_spending_limit` | Modify token spending limit for a key | `keyId`, `token`, `newLimit` |

### Rewards Tools (TIP-20 Rewards)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `opt_in_rewards` | Opt into token rewards program | `token` |
| `opt_out_rewards` | Opt out of rewards (optionally claim pending) | `token`, `claimPending?` |
| `claim_rewards` | Claim pending rewards | `token` |
| `distribute_rewards` | Distribute rewards to opted-in holders (issuer) | `token`, `amount`, `duration?` |
| `get_pending_rewards` | Check pending reward amount | `token`, `address?` |
| `set_reward_recipient` | Set auto-forward address for rewards | `token`, `recipient` |
| `get_reward_status` | Get full reward status and token stats | `token`, `address?` |

> **Duration**: Set `duration=0` for instant distribution. Time-based streaming rewards (duration > 0) are planned for future protocol updates.

### Exchange Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_swap_quote` | Get DEX quote for swap | `fromToken`, `toToken`, `amount` |
| `swap_stablecoins` | Execute stablecoin swap | `fromToken`, `toToken`, `amount`, `slippage?` |

### Fee AMM Tools (Liquidity Management)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_fee_pool_info` | Get pool reserves, LP supply, and swap rate | `userToken`, `validatorToken?` |
| `get_lp_position` | Check LP balance and underlying token value | `userToken`, `validatorToken?`, `address?` |
| `estimate_fee_swap` | Quote output for fee token conversion | `fromToken`, `toToken`, `amount` |
| `add_fee_liquidity` | Add liquidity to earn conversion fees | `userToken`, `amountUser`, `amountValidator` |
| `remove_fee_liquidity` | Withdraw liquidity and LP tokens | `userToken`, `lpAmount` |

### DEX Advanced Tools (Orderbook Trading)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `place_limit_order` | Place a resting limit order on the orderbook | `token`, `amount`, `side`, `tick` |
| `place_flip_order` | Place auto-reversing order for market making | `token`, `amount`, `side`, `tick`, `flipTick` |
| `cancel_order` | Cancel open order and refund tokens | `orderId` |
| `get_orderbook` | View bid/ask levels and spread | `baseToken`, `quoteToken?`, `depth?` |
| `get_my_orders` | List your open/filled/cancelled orders | `token?`, `status?` |
| `get_order_status` | Get order details and fill percentage | `orderId` |

> **Tick Pricing**: Price = 1 + tick/100,000. Tick 0 = $1.0000, tick -10 = $0.9999, tick 10 = $1.0001

---

## MCP Resources Reference

Resources provide read-only access to blockchain data via URI patterns:

| URI Pattern | Description |
|-------------|-------------|
| `tempo://network` | Network configuration and current block |
| `tempo://account/{address}` | Account info and token balances |
| `tempo://token/{address}` | TIP-20 token metadata |
| `tempo://token/{address}/roles` | Token role assignments and pause status |
| `tempo://token/{address}/rewards` | Token rewards status (opt-in, pending, stats) |
| `tempo://tx/{hash}` | Transaction details |
| `tempo://block/{number\|"latest"}` | Block information |
| `tempo://policy/{id}` | TIP-403 policy details (type, owner, token count) |
| `tempo://policy/{id}/whitelist/{address}` | Check if address is whitelisted |
| `tempo://policy/{id}/blacklist/{address}` | Check if address is blacklisted |
| `tempo://access-key/{account}/{keyId}` | Access key info (type, expiry, revoked status) |
| `tempo://access-key/{account}/{keyId}/limit/{token}` | Remaining spending limit for token |
| `tempo://fee-amm/{userToken}/{validatorToken}` | Fee AMM pool info (reserves, LP supply, swap rate) |
| `tempo://dex/orderbook/{baseToken}` | DEX orderbook with bid/ask levels |
| `tempo://dex/order/{orderId}` | Order details and fill status |

**Example Usage:**
```
Read tempo://account/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb
```

---

## MCP Prompts Reference

Prompts provide reusable conversation templates:

| Prompt | Description | Parameters |
|--------|-------------|------------|
| `payment-receipt` | Generate formatted payment receipt | `transactionHash` |
| `reconciliation-report` | Match transactions to invoices | `startDate`, `endDate`, `memoPrefix?` |
| `payroll-summary` | Summarize batch payment results | `batchTransactionHash` |
| `spending-report` | Analyze spending by recipient | `period`, `groupBy?` |
| `role-audit` | Audit token role assignments | `token` |
| `compliance-report` | Generate TIP-403 compliance status report | `addresses`, `policyId?`, `token?` |
| `rewards-summary` | Summarize rewards status and pending claims | `token`, `address?` |
| `fee-amm-summary` | Summarize Fee AMM pool status and LP position | `userToken`, `address?` |

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| **Network** | | |
| `TEMPO_RPC_URL` | RPC endpoint URL | `https://rpc.testnet.tempo.xyz` |
| `TEMPO_CHAIN_ID` | Chain ID | `42429` |
| `TEMPO_EXPLORER_URL` | Block explorer URL | `https://explore.tempo.xyz` |
| **Wallet** | | |
| `TEMPO_PRIVATE_KEY` | Wallet private key (0x-prefixed) | — |
| `TEMPO_KEYSTORE_PATH` | Path to encrypted keystore | — |
| `TEMPO_KEYSTORE_PASSWORD` | Keystore decryption password | — |
| **Security** | | |
| `TEMPO_MAX_SINGLE_PAYMENT` | Max single payment amount | `1000` |
| `TEMPO_DAILY_LIMIT` | Daily spending limit | `10000` |
| `TEMPO_ALLOWLIST_ENABLED` | Enable address restrictions | `false` |
| `TEMPO_RATE_LIMIT` | Max tool calls per minute | `60` |
| **Logging** | | |
| `TEMPO_LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `TEMPO_AUDIT_LOG_ENABLED` | Enable audit logging | `true` |
| `TEMPO_AUDIT_LOG_PATH` | Audit log file path | `./logs/audit.jsonl` |
| **Fee Sponsorship** | | |
| `TEMPO_FEE_SPONSORSHIP_ENABLED` | Enable gasless transactions | `false` |
| `TEMPO_FEE_PAYER_TYPE` | Sponsor mode (`local` or `relay`) | `local` |
| `TEMPO_FEE_PAYER_ADDRESS` | Fee payer wallet address | — |
| `TEMPO_FEE_PAYER_KEY` | Fee payer private key (local mode) | — |
| `TEMPO_FEE_RELAY_URL` | Relay service URL | `https://sponsor.testnet.tempo.xyz` |
| **Tokens** | | |
| `TEMPO_DEFAULT_TOKEN` | Default payment token | `AlphaUSD` |

### Configuration File

Create `tempo-mcp.config.yaml` for advanced configuration:

```yaml
network:
  rpcUrl: https://rpc.testnet.tempo.xyz
  chainId: 42429
  explorerUrl: https://explore.tempo.xyz

wallet:
  type: privateKey  # or 'keystore', 'external'

security:
  spendingLimits:
    maxSinglePayment:
      "*": "1000"           # Default for all tokens
      AlphaUSD: "5000"      # Override for specific token
    dailyLimit:
      "*": "10000"
    dailyTotalUSD: "50000"
    maxBatchSize: 50
    maxBatchTotalUSD: "25000"

  addressAllowlist:
    enabled: true
    mode: allowlist         # or 'blocklist'
    addresses:
      - "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb"
    labels:
      "0x742d35Cc...": "Payroll Account"

  rateLimits:
    toolCalls:
      windowMs: 60000
      maxCalls: 60
    highRiskOps:
      windowMs: 3600000
      maxCalls: 100

logging:
  level: info
  auditLog:
    enabled: true
    path: ./logs/audit.jsonl
    rotationDays: 30

feeSponsorship:
  enabled: true
  feePayer:
    type: local              # or 'relay' for testnet relay service
    address: "0x..."         # Fee payer wallet address
    privateKey: "0x..."      # Fee payer private key (local mode only)
    relayUrl: "https://sponsor.testnet.tempo.xyz"  # Relay endpoint
  maxSponsoredPerDay: "1000" # Daily sponsorship limit
```

### Configuration Priority

1. **Environment variables** (highest priority)
2. **Config file** (tempo-mcp.config.yaml/yml/json)
3. **Default values** (lowest priority)

---

## Security

tempo-mcp includes multiple security layers to protect against unauthorized transactions:

### Spending Limits

Prevent large or excessive payments:

```yaml
security:
  spendingLimits:
    maxSinglePayment:
      "*": "1000"           # Max $1000 per transaction
    dailyLimit:
      "*": "10000"          # Max $10,000 per day per token
    dailyTotalUSD: "50000"  # Max $50,000 per day total
```

### Address Allowlist

Restrict which addresses can receive payments:

```yaml
security:
  addressAllowlist:
    enabled: true
    mode: allowlist         # Only allow listed addresses
    addresses:
      - "0x..."             # Approved recipient
    labels:
      "0x...": "Vendor A"   # Human-readable label
```

### Rate Limiting

Prevent abuse and runaway agents:

```yaml
security:
  rateLimits:
    toolCalls:
      windowMs: 60000       # 1 minute window
      maxCalls: 60          # Max 60 calls per minute
    highRiskOps:
      windowMs: 3600000     # 1 hour window
      maxCalls: 100         # Max 100 high-risk ops per hour
```

### Audit Logging

All operations are logged for compliance:

```jsonl
{"timestamp":"2024-12-17T10:30:00Z","requestId":"abc123","tool":"send_payment","status":"success","tx":"0x...","amount":"100","to":"0x..."}
```

---

## Examples

### Basic Payment

```
User: "Send 50 AlphaUSD to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb"

→ Claude calls send_payment({
    token: "AlphaUSD",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
    amount: "50"
  })

→ Returns: {
    success: true,
    transactionHash: "0xabc123...",
    explorerUrl: "https://explore.tempo.xyz/tx/0xabc123..."
  }
```

### Payment with Memo (Invoice Reconciliation)

```
User: "Pay invoice #INV-2024-001 for 1500 AlphaUSD to 0x..."

→ Claude calls send_payment({
    token: "AlphaUSD",
    to: "0x...",
    amount: "1500",
    memo: "INV-2024-001"
  })
```

### Batch Payroll

```
User: "Process this month's payroll from employees.csv"

→ Claude calls batch_payments({
    token: "AlphaUSD",
    payments: [
      { to: "0x...", amount: "5000", label: "Alice" },
      { to: "0x...", amount: "4500", label: "Bob" },
      { to: "0x...", amount: "6000", label: "Carol" }
    ]
  })
```

### Sponsored (Gasless) Payment

```
User: "Send 100 AlphaUSD to 0x... using sponsored gas"

→ Claude calls send_sponsored_payment({
    token: "AlphaUSD",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
    amount: "100",
    useRelay: false  // Use local fee payer
  })

→ Returns: {
    success: true,
    transactionHash: "0xdef456...",
    feePayer: "0xabc...",
    feeAmount: "0.000073"
  }
```

### Example Agents

Explore complete agent implementations in the `/examples` directory:

| Example | Description |
|---------|-------------|
| [Basic Usage](./examples/basic-usage/) | Simple balance checks and payments |
| [Payroll Agent](./examples/payroll-agent/) | CSV-based batch payroll processing |
| [Invoice Agent](./examples/invoice-agent/) | AP automation with memo reconciliation |
| [Treasury Agent](./examples/treasury-agent/) | Multi-token portfolio management |
| [Compliance Agent](./examples/compliance-agent/) | TIP-403 whitelist/blacklist management |
| [Market Maker Agent](./examples/market-maker-agent/) | DEX orderbook trading with flip orders |

---

## Development

### Setup

```bash
git clone https://github.com/arome3/tempo-mcp
cd tempo-mcp
npm install
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Build TypeScript to dist/ |
| `npm start` | Run compiled server |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | TypeScript type checking |

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:run -- --coverage

# Run specific test file
npm test -- src/security/spending-limits.test.ts
```
---

## Network Information

### Tempo Testnet (Andantino)

| Property | Value |
|----------|-------|
| Chain ID | `42429` |
| RPC URL | `https://rpc.testnet.tempo.xyz` |
| Explorer | `https://explore.tempo.xyz` |
| Block Time | ~0.6 seconds |
| Faucet | [docs.tempo.xyz/quickstart/faucet](https://docs.tempo.xyz/quickstart/faucet) |

### Default Tokens

| Token | Address |
|-------|---------|
| AlphaUSD | `0x20c0000000000000000000000000000000000001` |

---

## Documentation

- [Tempo Docs](https://docs.tempo.xyz) — Official Tempo blockchain documentation
- [MCP Specification](https://modelcontextprotocol.io) — Model Context Protocol docs

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.7 |
| Runtime | Node.js 20+ |
| Protocol | MCP SDK 1.0 |
| Blockchain | viem 2.21, tempo.ts 0.10 |
| Validation | Zod 3.25 |
| Logging | Pino 8.21 |
| Build | tsup, tsx |
| Testing | Vitest |
| Linting | ESLint, Prettier |

---

## Troubleshooting

**"Connection refused" error**
- Ensure Node.js 20+ is installed: `node --version`
- Check that `TEMPO_PRIVATE_KEY` is set in your config

**"Insufficient balance" error**
- Get testnet tokens from the [faucet](https://docs.tempo.xyz/quickstart/faucet)
- Verify your balance: ask Claude *"What's my balance?"*

**"Spending limit exceeded"**
- Increase `TEMPO_MAX_SINGLE_PAYMENT` in your environment or config file
- Check `TEMPO_DAILY_LIMIT` if you've made many transactions today

**"Token not found" error**
- Use token symbol (`AlphaUSD`) or full address (`0x20c0...0001`)
- Check supported tokens in the [Network Information](#network-information) section

**Server not responding**
- Restart Claude Desktop after config changes
- Check logs: `tail -f ~/.config/Claude/logs/mcp*.log`

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

- [Tempo](https://tempo.xyz) — The stablecoin payments blockchain
- [Anthropic](https://anthropic.com) — Model Context Protocol
- [viem](https://viem.sh) — TypeScript Ethereum library

---

## Connect

Built by **Abraham Onoja**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat&logo=linkedin&logoColor=white)](https://linkedin.com/in/abraham-onoja/)
[![X (Twitter)](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white)](https://x.com/arome_dev)

Have questions, feedback, or want to collaborate? Reach out!

---

<p align="center">
  <strong>Built for the age of agentic commerce</strong>
</p>

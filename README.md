# tempo-mcp

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
| "Swap 1000 AlphaUSD to BetaUSD" | Exchange stablecoins on Tempo DEX |
| "Schedule payment of $200 to 0x... for tomorrow 9am" | Future-dated payment |

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

---

## Features

### Payment Operations
- **Single Payments** — Send TIP-20 stablecoin transfers with optional memos
- **Batch Payments** — Atomic multi-recipient transfers (up to 100 recipients)
- **Scheduled Payments** — Protocol-level future payments with execution windows

### Query Operations
- **Balance Queries** — Check single or multiple token balances
- **Transaction Lookups** — Get transaction details and history
- **Gas Estimation** — Estimate transaction costs

### Token Operations
- **Token Creation** — Deploy new TIP-20 tokens via factory contract
- **Mint/Burn** — Token supply management (requires ISSUER_ROLE)
- **Swap** — Exchange stablecoins on Tempo's native DEX

### Security
- **Spending Limits** — Per-token and daily USD limits
- **Address Allowlist** — Whitelist or blocklist recipient addresses
- **Rate Limiting** — Configurable limits per operation type
- **Audit Logging** — Structured JSON logs with request tracing

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
git clone https://github.com/arome/tempo-mcp.git
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

## AI Client Integration

### Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "tempo": {
      "command": "npx",
      "args": ["tempo-mcp"],
      "env": {
        "TEMPO_PRIVATE_KEY": "0x...",
        "TEMPO_RPC_URL": "https://rpc.testnet.tempo.xyz",
        "TEMPO_CHAIN_ID": "42429"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

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

### Generic MCP Client

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

### Exchange Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_swap_quote` | Get DEX quote for swap | `fromToken`, `toToken`, `amount` |
| `swap_stablecoins` | Execute stablecoin swap | `fromToken`, `toToken`, `amount`, `slippage?` |

---

## MCP Resources Reference

Resources provide read-only access to blockchain data via URI patterns:

| URI Pattern | Description |
|-------------|-------------|
| `tempo://network` | Network configuration and current block |
| `tempo://account/{address}` | Account info and token balances |
| `tempo://token/{address}` | TIP-20 token metadata |
| `tempo://tx/{hash}` | Transaction details |
| `tempo://block/{number\|"latest"}` | Block information |

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

### Example Agents

Explore complete agent implementations in the `/examples` directory:

| Example | Description |
|---------|-------------|
| [Basic Usage](./examples/basic-usage/) | Simple balance checks and payments |
| [Payroll Agent](./examples/payroll-agent/) | CSV-based batch payroll processing |
| [Invoice Agent](./examples/invoice-agent/) | AP automation with memo reconciliation |
| [Treasury Agent](./examples/treasury-agent/) | Multi-token portfolio management |

---

## Development

### Setup

```bash
git clone https://github.com/arome/tempo-mcp.git
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

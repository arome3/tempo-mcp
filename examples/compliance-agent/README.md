# Compliance Agent Example

This example demonstrates how to use tempo-mcp for TIP-403 Policy Registry compliance management. It shows how AI agents can check transfer compliance, manage whitelists/blacklists, and generate compliance reports.

## What is TIP-403?

TIP-403 is Tempo's on-chain compliance infrastructure that enables:

- **Whitelist Policies**: Only approved addresses can send/receive tokens
- **Blacklist Policies**: All addresses can transact except blocked ones
- **Pre-transfer Validation**: Compliance checked at the protocol level

## Features

This example includes:

1. **Policy Information** - Query policy details (type, owner, token count)
2. **Transfer Compliance** - Check if transfers are allowed before sending
3. **Whitelist Management** - Add/remove addresses from whitelist
4. **Blacklist Checks** - Verify if addresses are blocked
5. **Compliance Reports** - Generate status reports for multiple addresses

## Prerequisites

1. Node.js 18+ installed
2. tempo-mcp built (`npm run build` in root directory)
3. A wallet with policy owner permissions (for write operations)

## Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:
   ```
   TEMPO_PRIVATE_KEY=0x...
   TEMPO_DEFAULT_POLICY_ID=1
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Basic Demo

Run the main demo to see all features:

```bash
npm start
```

### Check Transfer Compliance

Verify if a transfer would be allowed:

```bash
npm run check -- <token> <from> <to>

# Example
npm run check -- 0x20c0000000000000000000000000000000000001 0xABC...123 0xDEF...456
```

### Manage Whitelist

Add, remove, or check whitelist status:

```bash
# Check if address is whitelisted
npm run whitelist -- check 1 0xABC...123

# Add address to whitelist (requires policy owner)
npm run whitelist -- add 1 0xABC...123

# Remove address from whitelist (requires policy owner)
npm run whitelist -- remove 1 0xABC...123
```

### Generate Compliance Report

Check multiple addresses at once:

```bash
npm run report -- <policyId> <address1> [address2] [address3]...

# Example
npm run report -- 1 0xABC...123 0xDEF...456 0x789...ABC
```

## Available Tools

This example uses the following tempo-mcp tools:

| Tool | Description |
|------|-------------|
| `get_policy_info` | Get policy details by ID |
| `check_transfer_compliance` | Pre-validate transfers |
| `is_whitelisted` | Check whitelist status |
| `is_blacklisted` | Check blacklist status |
| `add_to_whitelist` | Add address to whitelist |
| `remove_from_whitelist` | Remove from whitelist |
| `add_to_blacklist` | Block an address |
| `remove_from_blacklist` | Unblock an address |

## Policy Types

### Whitelist Policy

- Only whitelisted addresses can send/receive tokens
- Use for regulated assets requiring KYC/AML
- Add approved addresses before they can transact

### Blacklist Policy

- All addresses can transact by default
- Block specific addresses when needed
- Use for general-purpose tokens with sanctions compliance

### No Policy

- No transfer restrictions
- All addresses can freely transact
- Default state for unregulated tokens

## Error Handling

Common errors and solutions:

| Error | Solution |
|-------|----------|
| "Not policy owner" | Use a wallet with policy owner permissions |
| "Policy not found" | Verify the policy ID exists |
| "Address already whitelisted" | Address is already on the list |
| "Transfer blocked" | Address doesn't meet policy requirements |

## Related Documentation

- [TIP-403 Specification](https://docs.tempo.xyz/specifications/tip-403)
- [Policy Registry Contract](https://explore.tempo.xyz/address/0x403c000000000000000000000000000000000000)
- [tempo-mcp Documentation](../../docs/index.md)

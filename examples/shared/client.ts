/**
 * Shared MCP Client Setup
 *
 * Provides a reusable function to connect to the tempo-mcp server.
 * Used by all example agents.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TempoClientOptions {
  /** Custom server command (default: node) */
  command?: string;
  /** Custom server args (default: path to dist/index.js) */
  args?: string[];
  /** Additional environment variables */
  env?: Record<string, string>;
}

export interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Create and connect to the tempo-mcp server.
 *
 * @param options - Optional configuration overrides
 * @returns Connected MCP client
 *
 * @example
 * ```typescript
 * const client = await createTempoClient();
 * const result = await client.callTool({
 *   name: 'get_balance',
 *   arguments: { token: 'AlphaUSD' }
 * });
 * ```
 */
export async function createTempoClient(
  options: TempoClientOptions = {}
): Promise<Client> {
  // Validate required environment variables
  if (!process.env.TEMPO_PRIVATE_KEY) {
    console.error('Error: TEMPO_PRIVATE_KEY environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  // Resolve path to the tempo-mcp server
  const serverPath = resolve(__dirname, '../../dist/index.js');

  const transport = new StdioClientTransport({
    command: options.command ?? 'node',
    args: options.args ?? [serverPath],
    env: {
      ...process.env,
      TEMPO_PRIVATE_KEY: process.env.TEMPO_PRIVATE_KEY,
      TEMPO_RPC_URL:
        process.env.TEMPO_RPC_URL ?? 'https://rpc.testnet.tempo.xyz',
      TEMPO_CHAIN_ID: process.env.TEMPO_CHAIN_ID ?? '42429',
      ...options.env,
    },
  });

  const client = new Client(
    {
      name: 'tempo-example',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  return client;
}

/**
 * Parse the result from a tool call.
 *
 * @param result - Raw tool call result
 * @returns Parsed JSON object
 */
export function parseToolResult<T>(result: ToolCallResult): T {
  if (!result.content || result.content.length === 0) {
    throw new Error('Empty response from tool');
  }

  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in response');
  }

  return JSON.parse(textContent.text) as T;
}

/**
 * Call a tool and parse the result.
 *
 * @param client - MCP client
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns Parsed result
 */
export async function callTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as ToolCallResult;

  return parseToolResult<T>(result);
}

/**
 * Gracefully disconnect from the server.
 *
 * @param client - MCP client to disconnect
 */
export async function disconnect(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore close errors
  }
}

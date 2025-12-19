/**
 * MCP Server Instance
 *
 * This module creates and exports the McpServer instance that is shared
 * across all tool, resource, and prompt registrations.
 *
 * @see https://modelcontextprotocol.io for MCP specification
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * The tempo-mcp server instance.
 *
 * This server exposes Tempo blockchain functionality to AI clients through:
 * - Tools: Functions that perform actions (payments, swaps, token creation)
 * - Resources: Read-only data accessible by URI (tempo://account/{addr})
 * - Prompts: Reusable templates for common interactions
 */
export const server = new McpServer({
  name: 'tempo-mcp',
  version: '1.0.0',
});

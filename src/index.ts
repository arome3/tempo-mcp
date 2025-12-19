/**
 * tempo-mcp Server Entry Point
 *
 * This is the main entry point for the MCP server. It:
 * 1. Loads and validates configuration (env vars + config files)
 * 2. Imports tool/resource/prompt registrations (side effects)
 * 3. Starts the server with stdio transport
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Load and validate configuration before anything else
// This handles .env loading internally via dotenv
import { loadConfig, hasConfigFile, type TempoMcpConfig } from './config/index.js';

let config: TempoMcpConfig;

try {
  config = loadConfig();
  const configFile = hasConfigFile();
  if (configFile) {
    console.error(`Loaded configuration from ${configFile}`);
  }
} catch (error) {
  console.error('Configuration error:', error instanceof Error ? error.message : error);
  process.exit(1);
}

// Import the shared server instance
import { server } from './server.js';

// Import registration modules (side effects - registers tools/resources/prompts)
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Initialize and start the MCP server
 */
async function main() {
  // Log configuration info (to stderr, stdout reserved for MCP protocol)
  console.error(`Network: Chain ID ${config.network.chainId}`);
  console.error(`RPC: ${config.network.rpcUrl}`);
  console.error(`Log level: ${config.logging.level}`);

  // Register all capabilities
  registerAllTools();
  registerAllResources();
  registerAllPrompts();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('tempo-mcp server running on stdio');
}

// Handle startup errors gracefully
main().catch((error) => {
  console.error('Failed to start tempo-mcp server:', error);
  process.exit(1);
});

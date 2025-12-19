/**
 * Configuration System
 *
 * Central configuration loader that merges multiple sources:
 *   1. Default values (lowest priority)
 *   2. Config file (tempo-mcp.config.yaml/json)
 *   3. Environment variables (highest priority)
 *
 * Configuration is validated using Zod schemas and cached for performance.
 */

import { configSchema, type TempoMcpConfig } from './schema.js';
import { defaultConfig } from './defaults.js';
import { loadFromEnv, removeUndefined } from './env-loader.js';
import { loadFromFile, findConfigFile } from './file-loader.js';

// =============================================================================
// Deep Merge Utility
// =============================================================================

/**
 * Deep merge two objects.
 * Source values override target values at each level.
 * Arrays are replaced, not merged.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key as keyof T];

    // If both are plain objects, merge recursively
    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key as keyof T] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else {
      // Replace value (including arrays)
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }

  return result;
}

// =============================================================================
// Configuration Cache
// =============================================================================

let cachedConfig: TempoMcpConfig | null = null;

// =============================================================================
// Configuration Loading
// =============================================================================

/**
 * Load and validate configuration from all sources.
 *
 * Configuration priority (highest to lowest):
 *   1. Environment variables (TEMPO_*)
 *   2. Config file (tempo-mcp.config.yaml/yml/json)
 *   3. Default values
 *
 * @throws Error if configuration validation fails
 * @returns Validated, type-safe configuration object
 */
export function loadConfig(): TempoMcpConfig {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Start with default configuration
  let merged: Record<string, unknown> = { ...defaultConfig };

  // Merge config file (if exists)
  const fileConfig = loadFromFile();
  if (fileConfig) {
    merged = deepMerge(merged, fileConfig);
  }

  // Merge environment variables (highest priority)
  const envConfig = removeUndefined(loadFromEnv());
  merged = deepMerge(merged, envConfig);

  // Validate with Zod schema
  const result = configSchema.safeParse(merged);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  // Cache and return validated config
  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Get the current configuration.
 * Loads configuration if not already loaded.
 *
 * @returns Validated configuration object
 */
export function getConfig(): TempoMcpConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Reset the configuration cache.
 * Useful for testing or when configuration sources have changed.
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Check if a configuration file exists.
 *
 * @returns Name of config file if found, null otherwise
 */
export function hasConfigFile(): string | null {
  return findConfigFile();
}

// =============================================================================
// Re-exports
// =============================================================================

// Export schema and types for external use
export { configSchema } from './schema.js';
export type {
  TempoMcpConfig,
  NetworkConfig,
  WalletConfig,
  SecurityConfig,
  SpendingLimits,
  AddressAllowlist,
  RateLimits,
  TokensConfig,
  LoggingConfig,
  AdvancedConfig,
} from './schema.js';

// Export defaults for reference
export { defaultConfig } from './defaults.js';

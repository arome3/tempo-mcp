/**
 * Configuration File Loader
 *
 * Loads configuration from YAML or JSON files.
 * Searches for config files in a predefined order.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Configuration file names to search for, in priority order.
 * The first file found will be used.
 */
const CONFIG_FILE_NAMES = [
  'tempo-mcp.config.yaml',
  'tempo-mcp.config.yml',
  'tempo-mcp.config.json',
];

/**
 * Load configuration from a file.
 *
 * Searches for configuration files in the current working directory
 * in the following order:
 *   1. tempo-mcp.config.yaml
 *   2. tempo-mcp.config.yml
 *   3. tempo-mcp.config.json
 *
 * @param basePath - Base directory to search (defaults to cwd)
 * @returns Parsed configuration object, or null if no file found
 */
export function loadFromFile(basePath?: string): Record<string, unknown> | null {
  const searchDir = basePath ?? process.cwd();

  for (const filename of CONFIG_FILE_NAMES) {
    const filepath = `${searchDir}/${filename}`;

    if (existsSync(filepath)) {
      try {
        const content = readFileSync(filepath, 'utf-8');

        if (filename.endsWith('.json')) {
          return JSON.parse(content) as Record<string, unknown>;
        } else {
          // YAML files (.yaml, .yml)
          return parseYaml(content) as Record<string, unknown>;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse config file ${filepath}: ${message}`);
      }
    }
  }

  // No config file found
  return null;
}

/**
 * Check if a configuration file exists.
 *
 * @param basePath - Base directory to search (defaults to cwd)
 * @returns The name of the found config file, or null if none exists
 */
export function findConfigFile(basePath?: string): string | null {
  const searchDir = basePath ?? process.cwd();

  for (const filename of CONFIG_FILE_NAMES) {
    const filepath = `${searchDir}/${filename}`;
    if (existsSync(filepath)) {
      return filename;
    }
  }

  return null;
}

/**
 * Error Handler Unit Tests
 *
 * Tests for handleToolError and related utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  handleToolError,
  createToolError,
  createToolErrorFromException,
  formatToolError,
  createMcpErrorResponse,
  type ToolError,
  type McpErrorResponse,
} from '../../src/utils/error-handler.js';
import {
  ValidationError,
  SecurityError,
  BlockchainError,
  NetworkError,
  InternalError,
  InternalErrorCodes,
} from '../../src/utils/errors.js';

// =============================================================================
// handleToolError
// =============================================================================

describe('handleToolError', () => {
  it('should handle ValidationError', () => {
    const error = ValidationError.invalidAddress('0xinvalid');
    const response = handleToolError(error);

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe(1001);
    expect(parsed.error.message).toBe('Invalid Ethereum address format');
    expect(parsed.error.recoverable).toBe(true);
    expect(parsed.error.details).toBeDefined();
  });

  it('should handle SecurityError with retryAfter', () => {
    const error = SecurityError.rateLimitExceeded(30);
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(2004);
    expect(parsed.error.retryAfter).toBe(30);
    expect(parsed.error.recoverable).toBe(true);
  });

  it('should handle BlockchainError', () => {
    const error = BlockchainError.insufficientBalance('50', '100', 'USDC');
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(3001);
    expect(parsed.error.message).toBe('Insufficient token balance');
    expect(parsed.error.recoverable).toBe(false);
  });

  it('should handle NetworkError', () => {
    const error = NetworkError.connectionFailed('https://rpc.tempo.xyz');
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(4001);
    expect(parsed.error.recoverable).toBe(true);
    expect(parsed.error.retryAfter).toBe(5);
  });

  it('should handle InternalError', () => {
    const error = InternalError.walletNotConfigured();
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(5002);
    expect(parsed.error.message).toBe('Wallet not configured');
  });

  it('should handle standard Error', () => {
    const error = new Error('Something went wrong');
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
    expect(parsed.error.message).toBe('Something went wrong');
    expect(parsed.error.recoverable).toBe(false);
  });

  it('should handle string error', () => {
    const response = handleToolError('string error');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
    expect(parsed.error.message).toBe('string error');
  });

  it('should handle null/undefined', () => {
    const nullResponse = handleToolError(null);
    const undefinedResponse = handleToolError(undefined);

    expect(JSON.parse(nullResponse.content[0].text).error.message).toBe('null');
    expect(JSON.parse(undefinedResponse.content[0].text).error.message).toBe('undefined');
  });

  it('should return proper MCP structure', () => {
    const response = handleToolError(new Error('test'));

    // Check structure matches MCP error response format
    expect(response).toHaveProperty('content');
    expect(response).toHaveProperty('isError', true);
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0]).toHaveProperty('type', 'text');
    expect(response.content[0]).toHaveProperty('text');
  });

  it('should produce valid JSON', () => {
    const response = handleToolError(ValidationError.invalidToken('FAKE'));

    expect(() => JSON.parse(response.content[0].text)).not.toThrow();
  });

  it('should preserve error details', () => {
    const error = ValidationError.invalidAddress('0x123');
    const response = handleToolError(error);

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error.details).toEqual({
      field: 'address',
      received: '0x123',
      expected: '0x-prefixed 40-character hex string',
      suggestion: 'Ensure address starts with 0x and is 42 characters total',
    });
  });
});

// =============================================================================
// createToolError
// =============================================================================

describe('createToolError', () => {
  it('should create a ToolError from params', () => {
    const toolError = createToolError({
      code: 3001,
      message: 'Insufficient balance',
      details: { received: '50 USDC', expected: '100 USDC' },
      recoverable: false,
    });

    expect(toolError.code).toBe(3001);
    expect(toolError.message).toBe('Insufficient balance');
    expect(toolError.details).toEqual({ received: '50 USDC', expected: '100 USDC' });
    expect(toolError.recoverable).toBe(false);
    expect(toolError.retryAfter).toBeUndefined();
  });

  it('should default recoverable to false', () => {
    const toolError = createToolError({
      code: 1000,
      message: 'Test',
    });

    expect(toolError.recoverable).toBe(false);
  });

  it('should include retryAfter when provided', () => {
    const toolError = createToolError({
      code: 2004,
      message: 'Rate limited',
      recoverable: true,
      retryAfter: 60,
    });

    expect(toolError.retryAfter).toBe(60);
  });
});

// =============================================================================
// createToolErrorFromException
// =============================================================================

describe('createToolErrorFromException', () => {
  it('should convert TempoMcpError to ToolError', () => {
    const error = ValidationError.invalidAmount('-100');
    const toolError = createToolErrorFromException(error);

    expect(toolError.code).toBe(error.code);
    expect(toolError.message).toBe(error.message);
    expect(toolError.details).toEqual(error.details);
    expect(toolError.recoverable).toBe(error.recoverable);
    expect(toolError.retryAfter).toBe(error.retryAfter);
  });

  it('should preserve all properties from SecurityError', () => {
    const error = SecurityError.rateLimitExceeded(45);
    const toolError = createToolErrorFromException(error);

    expect(toolError.code).toBe(2004);
    expect(toolError.retryAfter).toBe(45);
    expect(toolError.recoverable).toBe(true);
  });
});

// =============================================================================
// formatToolError
// =============================================================================

describe('formatToolError', () => {
  it('should format ToolError as JSON string', () => {
    const toolError: ToolError = {
      code: 1001,
      message: 'Test error',
      recoverable: true,
    };

    const formatted = formatToolError(toolError);
    const parsed = JSON.parse(formatted);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toEqual(toolError);
  });

  it('should produce pretty-printed JSON', () => {
    const toolError: ToolError = {
      code: 1001,
      message: 'Test',
      recoverable: false,
    };

    const formatted = formatToolError(toolError);

    // Pretty-printed JSON contains newlines
    expect(formatted).toContain('\n');
    expect(formatted).toContain('  '); // Indentation
  });

  it('should include all fields', () => {
    const toolError: ToolError = {
      code: 2004,
      message: 'Rate limited',
      details: { suggestion: 'Wait' },
      recoverable: true,
      retryAfter: 30,
    };

    const formatted = formatToolError(toolError);
    const parsed = JSON.parse(formatted);

    expect(parsed.error.code).toBe(2004);
    expect(parsed.error.message).toBe('Rate limited');
    expect(parsed.error.details).toEqual({ suggestion: 'Wait' });
    expect(parsed.error.recoverable).toBe(true);
    expect(parsed.error.retryAfter).toBe(30);
  });
});

// =============================================================================
// createMcpErrorResponse
// =============================================================================

describe('createMcpErrorResponse', () => {
  it('should create MCP error response from ToolError', () => {
    const toolError: ToolError = {
      code: 3001,
      message: 'Insufficient balance',
      recoverable: false,
    };

    const response = createMcpErrorResponse(toolError);

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toEqual(toolError);
  });

  it('should match handleToolError output structure', () => {
    const error = ValidationError.invalidAddress('0x');
    const fromHandle = handleToolError(error);

    const toolError = createToolErrorFromException(error);
    const fromCreate = createMcpErrorResponse(toolError);

    // Both should have same structure
    expect(fromHandle.isError).toBe(fromCreate.isError);
    expect(fromHandle.content.length).toBe(fromCreate.content.length);
    expect(fromHandle.content[0].type).toBe(fromCreate.content[0].type);

    // Content should be equivalent
    const parsedHandle = JSON.parse(fromHandle.content[0].text);
    const parsedCreate = JSON.parse(fromCreate.content[0].text);
    expect(parsedHandle.success).toBe(parsedCreate.success);
    expect(parsedHandle.error.code).toBe(parsedCreate.error.code);
  });
});

// =============================================================================
// Type Assertions
// =============================================================================

describe('Type Assertions', () => {
  it('McpErrorResponse should have correct shape', () => {
    const response: McpErrorResponse = handleToolError(new Error('test'));

    // TypeScript would catch if these don't match
    const _content: Array<{ type: 'text'; text: string }> = response.content;
    const _isError: true = response.isError;

    expect(_content).toBeDefined();
    expect(_isError).toBe(true);
  });

  it('ToolError should have correct shape', () => {
    const toolError: ToolError = createToolError({
      code: 1000,
      message: 'Test',
      details: { field: 'test' },
      recoverable: true,
      retryAfter: 10,
    });

    // TypeScript would catch if these don't match
    const _code: number = toolError.code;
    const _message: string = toolError.message;
    const _recoverable: boolean = toolError.recoverable;

    expect(_code).toBe(1000);
    expect(_message).toBe('Test');
    expect(_recoverable).toBe(true);
  });
});

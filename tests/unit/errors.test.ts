/**
 * Error Classes Unit Tests
 *
 * Tests for TempoMcpError and all error subclasses.
 */

import { describe, it, expect } from 'vitest';
import {
  TempoMcpError,
  ValidationError,
  ValidationErrorCodes,
  SecurityError,
  SecurityErrorCodes,
  BlockchainError,
  BlockchainErrorCodes,
  NetworkError,
  NetworkErrorCodes,
  InternalError,
  InternalErrorCodes,
  isTempoMcpError,
  isValidationError,
  isSecurityError,
  isBlockchainError,
  isNetworkError,
  normalizeError,
} from '../../src/utils/errors.js';

// =============================================================================
// TempoMcpError Base Class
// =============================================================================

describe('TempoMcpError', () => {
  it('should create an error with code and message', () => {
    const error = new TempoMcpError(1000, 'Test error');

    expect(error.code).toBe(1000);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('TempoMcpError');
    expect(error.recoverable).toBe(false); // default
  });

  it('should support details and recoverable options', () => {
    const error = new TempoMcpError(1000, 'Test error', {
      details: { field: 'test', suggestion: 'Fix it' },
      recoverable: true,
      retryAfter: 5,
    });

    expect(error.details).toEqual({ field: 'test', suggestion: 'Fix it' });
    expect(error.recoverable).toBe(true);
    expect(error.retryAfter).toBe(5);
  });

  it('should serialize to JSON correctly', () => {
    const error = new TempoMcpError(1000, 'Test error', {
      details: { field: 'test' },
      recoverable: true,
      retryAfter: 10,
    });

    const json = error.toJSON();

    expect(json).toEqual({
      code: 1000,
      message: 'Test error',
      details: { field: 'test' },
      recoverable: true,
      retryAfter: 10,
    });
  });

  it('should preserve stack trace', () => {
    const error = new TempoMcpError(1000, 'Test error');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TempoMcpError');
  });
});

// =============================================================================
// ValidationError
// =============================================================================

describe('ValidationError', () => {
  describe('invalidAddress', () => {
    it('should create invalid address error', () => {
      const error = ValidationError.invalidAddress('invalid-addr');

      expect(error.code).toBe(ValidationErrorCodes.INVALID_ADDRESS);
      expect(error.message).toBe('Invalid Ethereum address format');
      expect(error.details?.field).toBe('address');
      expect(error.details?.received).toBe('invalid-addr');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('invalidAmount', () => {
    it('should create invalid amount error', () => {
      const error = ValidationError.invalidAmount('-100');

      expect(error.code).toBe(ValidationErrorCodes.INVALID_AMOUNT);
      expect(error.message).toBe('Amount must be a positive number');
      expect(error.details?.received).toBe('-100');
    });
  });

  describe('invalidToken', () => {
    it('should create invalid token error', () => {
      const error = ValidationError.invalidToken('FAKEUSD');

      expect(error.code).toBe(ValidationErrorCodes.INVALID_TOKEN);
      expect(error.message).toBe('Token not found or invalid');
      expect(error.details?.received).toBe('FAKEUSD');
    });
  });

  describe('invalidMemo', () => {
    it('should create invalid memo error', () => {
      const error = ValidationError.invalidMemo('this is a very long memo', 64);

      expect(error.code).toBe(ValidationErrorCodes.INVALID_MEMO);
      expect(error.message).toBe('Memo exceeds 32 bytes');
      expect(error.details?.received).toContain('64 bytes');
    });
  });

  describe('invalidTransactionHash', () => {
    it('should create invalid transaction hash error', () => {
      const error = ValidationError.invalidTransactionHash('0xinvalid');

      expect(error.code).toBe(ValidationErrorCodes.INVALID_TRANSACTION_HASH);
      expect(error.message).toBe('Invalid transaction hash format');
      expect(error.details?.received).toBe('0xinvalid');
    });
  });

  describe('missingField', () => {
    it('should create missing field error', () => {
      const error = ValidationError.missingField('amount');

      expect(error.code).toBe(ValidationErrorCodes.MISSING_REQUIRED_FIELD);
      expect(error.message).toBe('Missing required field: amount');
      expect(error.details?.field).toBe('amount');
    });
  });

  describe('transactionNotFound', () => {
    it('should create transaction not found error', () => {
      const error = ValidationError.transactionNotFound('0x123');

      expect(error.code).toBe(ValidationErrorCodes.TRANSACTION_NOT_FOUND);
      expect(error.message).toBe('Transaction not found');
      expect(error.details?.received).toBe('0x123');
    });
  });

  describe('custom', () => {
    it('should create custom validation error', () => {
      const error = ValidationError.custom('customField', 'Custom message', 'bad value');

      expect(error.code).toBe(ValidationErrorCodes.INVALID_FORMAT);
      expect(error.message).toBe('Custom message');
      expect(error.details?.field).toBe('customField');
      expect(error.details?.received).toBe('bad value');
    });
  });
});

// =============================================================================
// SecurityError
// =============================================================================

describe('SecurityError', () => {
  describe('spendingLimitExceeded', () => {
    it('should create spending limit exceeded error', () => {
      const error = SecurityError.spendingLimitExceeded('1000', '500', 'USDC');

      expect(error.code).toBe(SecurityErrorCodes.SPENDING_LIMIT_EXCEEDED);
      expect(error.message).toBe('Payment exceeds single transaction limit');
      expect(error.details?.received).toBe('1000 USDC');
      expect(error.details?.expected).toBe('Max 500 USDC per transaction');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('dailyLimitExceeded', () => {
    it('should create daily limit exceeded error', () => {
      const error = SecurityError.dailyLimitExceeded('5000', '5000', 'USDC');

      expect(error.code).toBe(SecurityErrorCodes.DAILY_LIMIT_EXCEEDED);
      expect(error.message).toBe('Daily spending limit reached');
      expect(error.recoverable).toBe(false); // Can't retry today
    });
  });

  describe('recipientNotAllowed', () => {
    it('should create recipient not allowed error', () => {
      const error = SecurityError.recipientNotAllowed('0x123');

      expect(error.code).toBe(SecurityErrorCodes.RECIPIENT_NOT_ALLOWED);
      expect(error.message).toBe('Recipient not in allowlist');
      expect(error.details?.received).toBe('0x123');
    });
  });

  describe('rateLimitExceeded', () => {
    it('should create rate limit exceeded error with retryAfter', () => {
      const error = SecurityError.rateLimitExceeded(30);

      expect(error.code).toBe(SecurityErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(error.message).toBe('Too many requests');
      expect(error.retryAfter).toBe(30);
      expect(error.recoverable).toBe(true);
    });
  });

  describe('confirmationRequired', () => {
    it('should create confirmation required error', () => {
      const error = SecurityError.confirmationRequired('10000', '5000');

      expect(error.code).toBe(SecurityErrorCodes.CONFIRMATION_REQUIRED);
      expect(error.message).toBe('High-value transaction requires confirmation');
      expect(error.recoverable).toBe(true);
    });
  });
});

// =============================================================================
// BlockchainError
// =============================================================================

describe('BlockchainError', () => {
  describe('insufficientBalance', () => {
    it('should create insufficient balance error', () => {
      const error = BlockchainError.insufficientBalance('50', '100', 'USDC');

      expect(error.code).toBe(BlockchainErrorCodes.INSUFFICIENT_BALANCE);
      expect(error.message).toBe('Insufficient token balance');
      expect(error.details?.received).toBe('50 USDC');
      expect(error.details?.expected).toBe('100 USDC');
    });
  });

  describe('insufficientGas', () => {
    it('should create insufficient gas error', () => {
      const error = BlockchainError.insufficientGas('AlphaUSD');

      expect(error.code).toBe(BlockchainErrorCodes.INSUFFICIENT_GAS);
      expect(error.message).toBe('Insufficient balance for gas');
      expect(error.details?.suggestion).toContain('AlphaUSD');
    });
  });

  describe('transactionReverted', () => {
    it('should create transaction reverted error', () => {
      const error = BlockchainError.transactionReverted('Transfer failed');

      expect(error.code).toBe(BlockchainErrorCodes.TRANSACTION_REVERTED);
      expect(error.message).toBe('Transaction reverted');
      expect(error.details?.received).toBe('Transfer failed');
    });

    it('should handle undefined reason', () => {
      const error = BlockchainError.transactionReverted();

      expect(error.details?.received).toBe('Unknown reason');
    });
  });

  describe('nonceTooLow', () => {
    it('should create nonce too low error', () => {
      const error = BlockchainError.nonceTooLow();

      expect(error.code).toBe(BlockchainErrorCodes.NONCE_TOO_LOW);
      expect(error.message).toBe('Nonce already used');
    });
  });

  describe('transactionTimeout', () => {
    it('should create transaction timeout error', () => {
      const error = BlockchainError.transactionTimeout('0xabc', 60000);

      expect(error.code).toBe(BlockchainErrorCodes.TRANSACTION_TIMEOUT);
      expect(error.message).toBe('Transaction confirmation timeout');
      expect(error.details?.received).toBe('0xabc');
      expect(error.details?.expected).toContain('60 seconds');
    });
  });

  describe('contractError', () => {
    it('should create contract error', () => {
      const error = BlockchainError.contractError('Access denied', '0x123');

      expect(error.code).toBe(BlockchainErrorCodes.CONTRACT_ERROR);
      expect(error.message).toBe('Smart contract error');
      expect(error.details?.received).toBe('Access denied');
      expect(error.details?.field).toBe('contract');
    });

    it('should handle missing contract address', () => {
      const error = BlockchainError.contractError('Error');

      expect(error.details?.field).toBeUndefined();
    });
  });
});

// =============================================================================
// NetworkError
// =============================================================================

describe('NetworkError', () => {
  describe('connectionFailed', () => {
    it('should create connection failed error', () => {
      const error = NetworkError.connectionFailed('https://rpc.tempo.xyz');

      expect(error.code).toBe(NetworkErrorCodes.RPC_CONNECTION_FAILED);
      expect(error.message).toBe('Failed to connect to RPC endpoint');
      expect(error.details?.received).toBe('https://rpc.tempo.xyz');
      expect(error.recoverable).toBe(true);
      expect(error.retryAfter).toBe(5);
    });
  });

  describe('requestFailed', () => {
    it('should create request failed error', () => {
      const error = NetworkError.requestFailed('eth_getBalance');

      expect(error.code).toBe(NetworkErrorCodes.RPC_REQUEST_FAILED);
      expect(error.message).toBe('RPC request failed: eth_getBalance');
    });
  });

  describe('rpcTimeout', () => {
    it('should create RPC timeout error', () => {
      const error = NetworkError.rpcTimeout('eth_call', 30000);

      expect(error.code).toBe(NetworkErrorCodes.RPC_TIMEOUT);
      expect(error.message).toBe('RPC request timed out: eth_call');
      expect(error.details?.received).toBe('Timeout after 30000ms');
      expect(error.recoverable).toBe(true);
    });
  });
});

// =============================================================================
// InternalError
// =============================================================================

describe('InternalError', () => {
  describe('unexpected', () => {
    it('should create unexpected error', () => {
      const error = InternalError.unexpected('Something went wrong');

      expect(error.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
      expect(error.message).toBe('Something went wrong');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('configurationError', () => {
    it('should create configuration error', () => {
      const error = InternalError.configurationError('Missing RPC URL');

      expect(error.code).toBe(InternalErrorCodes.CONFIGURATION_ERROR);
      expect(error.message).toBe('Missing RPC URL');
    });
  });

  describe('walletNotConfigured', () => {
    it('should create wallet not configured error', () => {
      const error = InternalError.walletNotConfigured();

      expect(error.code).toBe(InternalErrorCodes.WALLET_NOT_CONFIGURED);
      expect(error.message).toBe('Wallet not configured');
      expect(error.details?.suggestion).toContain('TEMPO_PRIVATE_KEY');
    });
  });
});

// =============================================================================
// Type Guards
// =============================================================================

describe('Type Guards', () => {
  describe('isTempoMcpError', () => {
    it('should return true for TempoMcpError', () => {
      expect(isTempoMcpError(new TempoMcpError(1000, 'test'))).toBe(true);
    });

    it('should return true for subclasses', () => {
      expect(isTempoMcpError(ValidationError.invalidAddress('0x'))).toBe(true);
      expect(isTempoMcpError(SecurityError.rateLimitExceeded(10))).toBe(true);
    });

    it('should return false for standard Error', () => {
      expect(isTempoMcpError(new Error('test'))).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isTempoMcpError('string')).toBe(false);
      expect(isTempoMcpError(null)).toBe(false);
      expect(isTempoMcpError(undefined)).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('should return true for ValidationError', () => {
      expect(isValidationError(ValidationError.invalidAddress('0x'))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isValidationError(SecurityError.rateLimitExceeded(10))).toBe(false);
    });
  });

  describe('isSecurityError', () => {
    it('should return true for SecurityError', () => {
      expect(isSecurityError(SecurityError.rateLimitExceeded(10))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isSecurityError(ValidationError.invalidAddress('0x'))).toBe(false);
    });
  });

  describe('isBlockchainError', () => {
    it('should return true for BlockchainError', () => {
      expect(isBlockchainError(BlockchainError.nonceTooLow())).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isBlockchainError(ValidationError.invalidAddress('0x'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for NetworkError', () => {
      expect(isNetworkError(NetworkError.connectionFailed('url'))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isNetworkError(ValidationError.invalidAddress('0x'))).toBe(false);
    });
  });
});

// =============================================================================
// normalizeError
// =============================================================================

describe('normalizeError', () => {
  it('should return TempoMcpError unchanged', () => {
    const error = ValidationError.invalidAddress('0x');
    const normalized = normalizeError(error);

    expect(normalized).toBe(error);
  });

  it('should wrap standard Error', () => {
    const error = new Error('Standard error');
    const normalized = normalizeError(error);

    expect(normalized.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
    expect(normalized.message).toBe('Standard error');
    expect(normalized.recoverable).toBe(false);
  });

  it('should wrap string', () => {
    const normalized = normalizeError('string error');

    expect(normalized.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
    expect(normalized.message).toBe('string error');
  });

  it('should wrap null/undefined', () => {
    expect(normalizeError(null).message).toBe('null');
    expect(normalizeError(undefined).message).toBe('undefined');
  });

  it('should wrap objects', () => {
    const normalized = normalizeError({ foo: 'bar' });

    expect(normalized.code).toBe(InternalErrorCodes.INTERNAL_ERROR);
    expect(normalized.message).toBe('[object Object]');
  });
});

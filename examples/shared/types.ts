/**
 * Shared TypeScript Types
 *
 * Common interfaces used across all example agents.
 * These mirror the tool input/output schemas from tempo-mcp.
 */

// =============================================================================
// Balance Types
// =============================================================================

export interface BalanceResult {
  address: string;
  token: string;
  tokenSymbol: string;
  tokenName: string;
  balance: string;
  balanceRaw: string;
  decimals: number;
}

export interface BalancesResult {
  address: string;
  balances: BalanceResult[];
}

// =============================================================================
// Payment Types
// =============================================================================

export interface PaymentInput {
  token: string;
  to: string;
  amount: string;
  memo?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  from?: string;
  to?: string;
  amount?: string;
  amountRaw?: string;
  token?: string;
  tokenSymbol?: string;
  memo?: string | null;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface BatchPaymentItem {
  to: string;
  amount: string;
  memo?: string;
  label?: string;
}

export interface BatchPaymentInput {
  token: string;
  payments: BatchPaymentItem[];
}

export interface BatchPaymentResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  tokenSymbol?: string;
  totalAmount?: string;
  recipientCount?: number;
  payments?: Array<{
    to: string;
    amount: string;
    memo: string | null;
    label: string | null;
    status: string;
  }>;
  gasCost?: string;
  gasPerPayment?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

// =============================================================================
// Scheduled Payment Types
// =============================================================================

export interface SchedulePaymentInput {
  token: string;
  to: string;
  amount: string;
  memo?: string;
  executeAt: string;
  validFrom?: string;
  validUntil?: string;
}

export interface SchedulePaymentResult {
  success: boolean;
  scheduleId?: string;
  transactionHash?: string;
  token?: string;
  tokenSymbol?: string;
  to?: string;
  amount?: string;
  amountRaw?: string;
  memo?: string | null;
  executeAt?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  status?: string;
  explorerUrl?: string;
  createdAt?: string;
  error?: ErrorDetails;
}

// =============================================================================
// Transaction Types
// =============================================================================

export interface TransactionResult {
  hash: string;
  blockNumber: number | null;
  blockHash: string | null;
  from: string;
  to: string | null;
  value: string;
  status: 'success' | 'reverted' | 'pending';
  type: string;
  token: {
    address: string;
    symbol: string;
    name: string;
    amount: string;
    amountRaw: string;
    decimals: number;
  } | null;
  memo: string | null;
  memoDecoded: string | null;
  gasUsed: string;
  gasPrice: string;
  gasCost: string;
  timestamp: string | null;
  confirmations: number;
  explorerUrl: string;
}

// =============================================================================
// Exchange Types
// =============================================================================

export interface SwapQuoteInput {
  fromToken: string;
  toToken: string;
  amount: string;
  direction?: 'exactIn' | 'exactOut';
}

export interface SwapQuoteResult {
  fromToken: string;
  fromTokenSymbol: string;
  toToken: string;
  toTokenSymbol: string;
  amountIn: string;
  amountOut: string;
  rate: string;
  inverseRate: string;
  direction: 'exactIn' | 'exactOut';
  validFor: number;
}

export interface SwapInput {
  fromToken: string;
  toToken: string;
  amount: string;
  direction?: 'exactIn' | 'exactOut';
  slippageTolerance?: number;
}

export interface SwapResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  fromToken?: string;
  fromTokenSymbol?: string;
  toToken?: string;
  toTokenSymbol?: string;
  amountIn?: string;
  amountOut?: string;
  effectiveRate?: string;
  slippage?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

// =============================================================================
// Error Types
// =============================================================================

export interface ErrorDetails {
  code: number;
  message: string;
  details?: {
    field?: string;
    expected?: string;
    received?: string;
    suggestion?: string;
  };
  recoverable?: boolean;
  retryAfter?: number;
}

// =============================================================================
// Payroll Types
// =============================================================================

export interface PayrollEmployee {
  employeeId: string;
  name: string;
  walletAddress: string;
  amount: string;
  department?: string;
}

export interface PayrollValidationResult {
  valid: boolean;
  totalAmount: string;
  employeeCount: number;
  issues: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  validEmployees: PayrollEmployee[];
}

// =============================================================================
// Invoice Types
// =============================================================================

export interface Invoice {
  id: string;
  vendor: string;
  vendorAddress: string;
  amount: string;
  currency: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'scheduled' | 'overdue';
  paidTxHash?: string;
}

export interface InvoiceReconciliation {
  invoice: Invoice;
  transaction?: TransactionResult;
  matched: boolean;
  matchedAt?: string;
}

// =============================================================================
// Treasury Types
// =============================================================================

export interface PortfolioBalance {
  token: string;
  symbol: string;
  balance: string;
  valueUSD: number;
  allocation: number;
}

export interface PortfolioSummary {
  address: string;
  totalValueUSD: number;
  balances: PortfolioBalance[];
  lastUpdated: string;
}

export interface TargetAllocation {
  token: string;
  targetPercent: number;
}

export interface RebalanceAction {
  type: 'swap';
  fromToken: string;
  toToken: string;
  amount: string;
  reason: string;
}

// =============================================================================
// Role Management Types
// =============================================================================

/**
 * TIP-20 role names for token access control.
 */
export type RoleName =
  | 'DEFAULT_ADMIN_ROLE'
  | 'ISSUER_ROLE'
  | 'PAUSE_ROLE'
  | 'UNPAUSE_ROLE'
  | 'BURN_BLOCKED_ROLE';

export interface GrantRoleInput {
  token: string;
  role: RoleName;
  account: string;
}

export interface RevokeRoleInput {
  token: string;
  role: RoleName;
  account: string;
}

export interface RenounceRoleInput {
  token: string;
  role: RoleName;
}

export interface HasRoleInput {
  token: string;
  role: RoleName;
  account: string;
}

export interface GetRoleMembersInput {
  token: string;
  role: RoleName;
}

export interface PauseTokenInput {
  token: string;
  reason?: string;
}

export interface UnpauseTokenInput {
  token: string;
  reason?: string;
}

export interface RoleTransactionResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  role?: RoleName;
  account?: string;
  grantedBy?: string;
  revokedBy?: string;
  renouncedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface HasRoleResult {
  hasRole: boolean;
  token: string;
  role: RoleName;
  account: string;
  roleDescription: string;
}

export interface GetRoleMembersResult {
  token: string;
  role: RoleName;
  members: string[];
  memberCount: number;
  roleDescription: string;
}

export interface PauseTokenResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  isPaused: boolean;
  pausedBy?: string;
  unpausedBy?: string;
  reason?: string | null;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface TokenRolesInfo {
  token: string;
  isPaused: boolean;
  roles: {
    [key in RoleName]: {
      members: string[];
      memberCount: number;
      description: string;
    };
  };
}

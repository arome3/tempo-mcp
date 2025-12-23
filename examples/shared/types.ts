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

// =============================================================================
// Policy Management Types (TIP-403)
// =============================================================================

/**
 * TIP-403 policy types for transfer restrictions.
 */
export type PolicyType = 'whitelist' | 'blacklist' | 'none';

export interface CheckTransferComplianceInput {
  token: string;
  from: string;
  to: string;
}

export interface CheckTransferComplianceResult {
  allowed: boolean;
  policyId: number | null;
  policyType: PolicyType;
  fromStatus: {
    isWhitelisted: boolean;
    isBlacklisted: boolean;
  };
  toStatus: {
    isWhitelisted: boolean;
    isBlacklisted: boolean;
  };
  reason: string | null;
  token: string;
  from: string;
  to: string;
}

export interface GetPolicyInfoInput {
  policyId: number;
}

export interface GetPolicyInfoResult {
  policyId: number;
  policyType: PolicyType;
  policyTypeDescription: string;
  owner: string;
  tokenCount: number;
}

export interface IsWhitelistedInput {
  policyId: number;
  account: string;
}

export interface IsWhitelistedResult {
  isWhitelisted: boolean;
  policyId: number;
  account: string;
}

export interface IsBlacklistedInput {
  policyId: number;
  account: string;
}

export interface IsBlacklistedResult {
  isBlacklisted: boolean;
  policyId: number;
  account: string;
}

export interface AddToWhitelistInput {
  policyId: number;
  account: string;
}

export interface AddToWhitelistResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  policyId?: number;
  account?: string;
  action?: 'whitelisted';
  addedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface RemoveFromWhitelistInput {
  policyId: number;
  account: string;
}

export interface RemoveFromWhitelistResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  policyId?: number;
  account?: string;
  action?: 'removed_from_whitelist';
  removedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface AddToBlacklistInput {
  policyId: number;
  account: string;
}

export interface AddToBlacklistResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  policyId?: number;
  account?: string;
  action?: 'blacklisted';
  blockedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface RemoveFromBlacklistInput {
  policyId: number;
  account: string;
}

export interface RemoveFromBlacklistResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  policyId?: number;
  account?: string;
  action?: 'removed_from_blacklist';
  unblockedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface BurnBlockedTokensInput {
  token: string;
  blockedAddress: string;
  amount: string;
}

export interface BurnBlockedTokensResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  blockedAddress?: string;
  amountBurned?: string;
  amountBurnedFormatted?: string;
  burnedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface CreatePolicyInput {
  policyType: 'whitelist' | 'blacklist';
  admin?: string;
  initialAccounts?: string[];
}

export interface CreatePolicyResult {
  success: boolean;
  policyId?: number;
  policyType?: 'whitelist' | 'blacklist';
  admin?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

// =============================================================================
// Fee Sponsorship Types
// =============================================================================

export interface SponsoredPaymentInput {
  token: string;
  to: string;
  amount: string;
  memo?: string;
  feePayer?: string;
  useRelay?: boolean;
}

export interface SponsoredPaymentResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  from?: string;
  to?: string;
  amount?: string;
  token?: string;
  tokenSymbol?: string;
  memo?: string | null;
  feePayer?: string;
  feeAmount?: string;
  feeToken?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface EstimateSponsoredGasInput {
  token: string;
  to: string;
  amount: string;
  feeToken?: string;
}

export interface EstimateSponsoredGasResult {
  gasLimit: string;
  estimatedFee: string;
  feeToken: string;
  feeTokenSymbol: string;
}

export interface SponsorBalanceInput {
  sponsor?: string;
  token?: string;
}

export interface SponsorBalanceResult {
  balance: string;
  balanceRaw: string;
  sponsor: string;
  token: string;
  tokenSymbol: string;
}

// =============================================================================
// Access Key Types (Session Keys)
// =============================================================================

/**
 * Signature types supported by Tempo access keys.
 */
export type SignatureTypeName = 'secp256k1' | 'p256' | 'webauthn';

export interface GetAccessKeyInfoInput {
  keyId: string;
  account?: string;
}

export interface GetAccessKeyInfoResult {
  found: boolean;
  keyId: string;
  account: string;
  signatureType: SignatureTypeName | null;
  signatureTypeDescription: string | null;
  expiry: number | null;
  expiryISO: string | null;
  isExpired: boolean | null;
  enforceLimits: boolean | null;
  isRevoked: boolean | null;
  isActive: boolean;
}

export interface GetRemainingLimitInput {
  keyId: string;
  token: string;
  account?: string;
}

export interface GetRemainingLimitResult {
  keyId: string;
  account: string;
  token: string;
  remainingLimit: string;
  remainingLimitFormatted: string;
  isUnlimited: boolean;
}

export interface RevokeAccessKeyInput {
  keyId: string;
}

export interface RevokeAccessKeyResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  keyId?: string;
  revokedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface UpdateSpendingLimitInput {
  keyId: string;
  token: string;
  newLimit: string;
}

export interface UpdateSpendingLimitResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  keyId?: string;
  token?: string;
  newLimit?: string;
  newLimitFormatted?: string;
  updatedBy?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

// =============================================================================
// Rewards Types (TIP-20 Rewards)
// =============================================================================

export interface OptInRewardsInput {
  token: string;
}

export interface OptInRewardsResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  tokenSymbol?: string;
  account?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface OptOutRewardsInput {
  token: string;
  claimPending?: boolean;
}

export interface OptOutRewardsResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  tokenSymbol?: string;
  account?: string;
  claimedAmount?: string;
  claimedAmountFormatted?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface ClaimRewardsInput {
  token: string;
}

export interface ClaimRewardsResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  tokenSymbol?: string;
  account?: string;
  amountClaimed?: string;
  amountClaimedFormatted?: string;
  recipient?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface GetPendingRewardsInput {
  token: string;
  address?: string;
}

export interface GetPendingRewardsResult {
  token: string;
  tokenSymbol: string;
  address: string;
  pendingRewards: string;
  pendingRewardsFormatted: string;
  isOptedIn: boolean;
}

export interface SetRewardRecipientInput {
  token: string;
  recipient: string;
}

export interface SetRewardRecipientResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  token?: string;
  tokenSymbol?: string;
  account?: string;
  recipient?: string;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface GetRewardStatusInput {
  token: string;
  address?: string;
}

export interface GetRewardStatusResult {
  token: string;
  tokenSymbol: string;
  address: string;
  isOptedIn: boolean;
  pendingRewards: string;
  pendingRewardsFormatted: string;
  optedInBalance: string;
  optedInBalanceFormatted: string;
  totalBalance: string;
  totalBalanceFormatted: string;
  rewardRecipient: string | null;
  totalClaimed: string;
  totalClaimedFormatted: string;
  tokenStats: {
    totalOptedInSupply: string;
    totalOptedInSupplyFormatted: string;
    totalDistributed: string;
    totalDistributedFormatted: string;
  };
}

// =============================================================================
// DEX Advanced Types (Orderbook Trading)
// =============================================================================

/**
 * Order side for DEX limit/flip orders.
 */
export type OrderSide = 'buy' | 'sell';

/**
 * Order status in the DEX.
 */
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'queued';

export interface PlaceLimitOrderInput {
  token: string;
  amount: string;
  side: OrderSide;
  tick: number;
}

export interface PlaceLimitOrderResult {
  success: boolean;
  orderId?: string;
  token?: string;
  tokenSymbol?: string;
  side?: OrderSide;
  amount?: string;
  amountRaw?: string;
  tick?: number;
  price?: string;
  status?: string;
  note?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface PlaceFlipOrderInput {
  token: string;
  amount: string;
  side: OrderSide;
  tick: number;
  flipTick?: number;
}

export interface PlaceFlipOrderResult {
  success: boolean;
  orderId?: string;
  token?: string;
  tokenSymbol?: string;
  side?: OrderSide;
  amount?: string;
  amountRaw?: string;
  tick?: number;
  tickPrice?: string;
  flipTick?: number;
  flipPrice?: string;
  status?: string;
  behavior?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface CancelOrderInput {
  orderId: string;
}

export interface CancelOrderResult {
  success: boolean;
  orderId?: string;
  cancelledOrder?: {
    side: string;
    amount: string;
    filled: string;
    tick: number;
    price: string;
  };
  refundedAmount?: string;
  refundedAmountRaw?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasCost?: string;
  explorerUrl?: string;
  timestamp?: string;
  error?: ErrorDetails;
}

export interface GetOrderbookInput {
  baseToken: string;
  quoteToken?: string;
  depth?: number;
}

export interface OrderbookLevel {
  price: string;
  tick: number;
  amount: string;
}

export interface GetOrderbookResult {
  pair: string;
  baseToken: string;
  quoteToken: string;
  midPrice: string | null;
  spread: string | null;
  spreadPercent: string | null;
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
}

export interface GetMyOrdersInput {
  token?: string;
  status?: 'open' | 'filled' | 'cancelled' | 'all';
}

export interface OrderInfo {
  orderId: string;
  token: string;
  tokenSymbol: string;
  side: string;
  amount: string;
  filled: string;
  remaining: string;
  tick: number;
  price: string;
  status: string;
  isFlip: boolean;
}

export interface GetMyOrdersResult {
  totalOrders: number;
  orders: OrderInfo[];
}

export interface GetOrderStatusInput {
  orderId: string;
}

export interface GetOrderStatusResult {
  orderId: string;
  owner: string;
  token: string;
  tokenSymbol: string;
  side: string;
  tick: number;
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  fillPercent: string;
  status: string;
  isFlip: boolean;
}

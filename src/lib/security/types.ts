export type ChangeType = "phone" | "email" | "both";
export type ContactRequestStatus =
  | "pending"
  | "awaiting_old_verification"
  | "awaiting_new_verification"
  | "under_review"
  | "approved"
  | "rejected"
  | "reversed";

export type FraudFlagType =
  | "contact_change"
  | "referral_abuse"
  | "credit_abuse"
  | "cashout_risk"
  | "device_risk"
  | "profile_abuse";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type FlagStatus = "open" | "reviewing" | "resolved" | "blocked";

export type CreditTxType =
  | "earn"
  | "redeem"
  | "cashout"
  | "reverse"
  | "block"
  | "adjust"
  | "service_spend";
export type CreditTxStatus =
  | "pending"
  | "approved"
  | "completed"
  | "failed"
  | "reversed"
  | "blocked";

export type CashoutStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "processing"
  | "paid"
  | "failed"
  | "reversed";

export type ReferralEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "reversed";

export type SessionStatus = "active" | "revoked" | "expired";

export interface ContactChangeRequest {
  id: string;
  userId: string;
  changeType: ChangeType;
  oldValue: string;
  newValue: string;
  oldVerified: boolean;
  newVerified: boolean;
  passwordConfirmed: boolean;
  oldCode?: string;
  newCode?: string;
  codeAttempts: number;
  riskScore: number;
  status: ContactRequestStatus;
  adminId?: string;
  reason?: string;
  deviceInfo?: Record<string, unknown>;
  sessionInfo?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  reversedAt?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  os?: string;
  browser?: string;
  ipAddress?: string;
  location?: string;
  sessionStatus: SessionStatus;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface ReferralCode {
  id: string;
  userId: string;
  referralCode: string;
  referralLink?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralEvent {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCodeUsed?: string;
  status: ReferralEventStatus;
  rewardAmount: number;
  rewardType: string;
  eligibilityStatus?: string;
  adminId?: string;
  reason?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  reversedAt?: string;
}

export interface CreditWallet {
  id: string;
  userId: string;
  totalEarned: number;
  pendingCredits: number;
  availableCredits: number;
  redeemedCredits: number;
  cashableCredits: number;
  serviceSpendCredits: number;
  reversedCredits: number;
  blockedCredits: number;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  walletId?: string;
  userId: string;
  transactionType: CreditTxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: CreditTxStatus;
  referenceType?: string;
  referenceId?: string;
  adminId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

export interface CashoutRequest {
  id: string;
  userId: string;
  walletId?: string;
  requestedAmount: number;
  feeAmount: number;
  netAmount: number;
  status: CashoutStatus;
  payoutMethod: string;
  destinationAccount?: string;
  adminId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export interface FraudFlag {
  id: string;
  userId: string;
  flagType: FraudFlagType;
  riskLevel: RiskLevel;
  description?: string;
  status: FlagStatus;
  adminId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  adminName?: string;
  targetType: string;
  targetId?: string;
  actionType: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  result?: string;
  status: string;
  errorMessage?: string;
  ipAddress?: string;
  deviceInfo?: string;
  createdAt: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy?: string;
}

export interface WalletSummary {
  totalEarned: number;
  pendingCredits: number;
  availableCredits: number;
  redeemedCredits: number;
  cashableCredits: number;
  serviceSpendCredits: number;
  reversedCredits: number;
  blockedCredits: number;
}

export interface NameChangeRequest {
  id: string;
  userId: string;
  currentName: string;
  requestedName: string;
  reason?: string;
  identityDocumentUrl?: string;
  identityDocumentType?: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  adminId?: string;
  adminReason?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactChangeInput {
  userId: string;
  changeType: ChangeType;
  oldValue: string;
  newValue: string;
  passwordConfirmed?: boolean;
  deviceInfo?: Record<string, unknown>;
  sessionInfo?: Record<string, unknown>;
}

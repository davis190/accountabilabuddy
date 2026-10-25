export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type MembershipRole = 'owner' | 'member';
export type MembershipStatus = 'active' | 'left' | 'removed';
export type AccountStatus = 'active' | 'deleting' | 'deleted';
export type GroupStatus = 'active' | 'deleted';

export interface User {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  accountStatus: AccountStatus;
  termsAcceptedAt?: string;
}

export interface Group {
  groupId: string;
  name: string;
  ownerUserId: string;
  weekStartsOn: Weekday;
  memberInviteEnabled: boolean;
  status: GroupStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Membership {
  groupId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
  leftAt?: string;
  weeklyPointTarget: number;
  targetEffectiveAt: string;
  dailyReminderEnabled: boolean;
  dailyReminderLocalTime?: string;
  weeklyCheckInEnabled: boolean;
  weeklyCheckInDay?: Weekday;
  weeklyCheckInLocalTime?: string;
  timezone: string;
  lastUsedAt?: string;
  version: number;
}

export interface Goal {
  goalId: string;
  groupId: string;
  userId: string;
  name: string;
  icon?: string;
  description?: string;
  targetDaysPerWeek: number;
  activeFrom: string;
  archivedAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Completion {
  completionId: string;
  groupId: string;
  userId: string;
  goalId: string;
  localDate: string;
  weekStartDate: string;
  createdAt: string;
  updatedAt: string;
}

/** Per-person Away day — blocks check-offs and proportionally lowers that week's targets. */
export interface AwayDay {
  userId: string;
  localDate: string;
  createdAt: string;
}

export interface WeeklySnapshot {
  groupId: string;
  weekStartDate: string;
  userId: string;
  weeklyPointTargetSnapshot: number;
  points: number;
  goalTargetSnapshot: Record<string, number>;
  lastRecalculatedAt: string;
  version: number;
}

export interface Invitation {
  invitationId: string;
  groupId: string;
  tokenHash: string;
  createdBy: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  revokedAt?: string;
  createdAt: string;
  ttl?: number;
}

export interface NotificationDelivery {
  deliveryKey: string;
  attempt: number;
  status: 'pending' | 'sent' | 'failed' | 'suppressed';
  sesMessageId?: string;
  scheduledFor: string;
  sentAt?: string;
  errorCode?: string;
  createdAt: string;
  ttl?: number;
}

export interface MemberWeekSummary {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  pointsEarned: number;
  weeklyPointTarget: number;
  progressPercent: number;
  position: number;
  tied: boolean;
  statusLabel: 'On track' | 'Target reached' | 'Keep going';
  awayDates?: string[];
  goalProgress: Array<{
    goalId: string;
    name: string;
    icon?: string;
    completedDays: number;
    targetDays: number;
  }>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
}

export const SAFE_GOAL_ICONS = [
  'run',
  'lift',
  'stretch',
  'walk',
  'bike',
  'swim',
  'yoga',
  'water',
  'veggie',
  'protein',
  'sleep',
  'read',
  'meditate',
  'journal',
  'cook',
] as const;

export type SafeGoalIcon = (typeof SAFE_GOAL_ICONS)[number];

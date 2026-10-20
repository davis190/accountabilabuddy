import type {
  Completion,
  Goal,
  Group,
  Invitation,
  Membership,
  NotificationDelivery,
  User,
  WeeklySnapshot,
} from '@accountabilabuddy/shared';

export interface Store {
  getUser(userId: string): Promise<User | null>;
  putUser(user: User): Promise<void>;
  deleteUser(userId: string): Promise<void>;

  getGroup(groupId: string): Promise<Group | null>;
  putGroup(group: Group): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;

  getMembership(groupId: string, userId: string): Promise<Membership | null>;
  putMembership(membership: Membership): Promise<void>;
  listMembershipsByUser(userId: string): Promise<Membership[]>;
  listMembershipsByGroup(groupId: string): Promise<Membership[]>;

  getGoal(groupId: string, userId: string, goalId: string): Promise<Goal | null>;
  putGoal(goal: Goal): Promise<void>;
  deleteGoal(groupId: string, userId: string, goalId: string): Promise<void>;
  listGoals(groupId: string, userId: string): Promise<Goal[]>;

  getCompletion(
    groupId: string,
    userId: string,
    weekStartDate: string,
    localDate: string,
    goalId: string,
  ): Promise<Completion | null>;
  putCompletion(completion: Completion): Promise<{ created: boolean; completion: Completion }>;
  deleteCompletion(
    groupId: string,
    userId: string,
    weekStartDate: string,
    localDate: string,
    goalId: string,
  ): Promise<boolean>;
  listCompletionsForWeek(
    groupId: string,
    userId: string,
    weekStartDate: string,
  ): Promise<Completion[]>;
  listCompletionsInRange(
    groupId: string,
    userId: string,
    from: string,
    to: string,
    weekStartsOn: import('@accountabilabuddy/shared').Weekday,
  ): Promise<Completion[]>;

  getWeeklySnapshot(
    groupId: string,
    weekStartDate: string,
    userId: string,
  ): Promise<WeeklySnapshot | null>;
  putWeeklySnapshot(snapshot: WeeklySnapshot): Promise<void>;

  getInvitation(invitationId: string): Promise<Invitation | null>;
  getInvitationByTokenHash(tokenHash: string): Promise<Invitation | null>;
  putInvitation(invitation: Invitation): Promise<void>;

  putNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<{ created: boolean }>;

  /** Test helper */
  reset?(): Promise<void>;
}

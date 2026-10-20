import {
  completionSortKey,
  groupUserKey,
  groupUserWeekKey,
  groupWeekKey,
  weekStartDate,
  type Completion,
  type Goal,
  type Group,
  type Invitation,
  type Membership,
  type NotificationDelivery,
  type User,
  type Weekday,
  type WeeklySnapshot,
} from '@accountabilabuddy/shared';
import type { Store } from './types.js';

export class MemoryStore implements Store {
  users = new Map<string, User>();
  groups = new Map<string, Group>();
  memberships = new Map<string, Membership>();
  goals = new Map<string, Goal>();
  completions = new Map<string, Completion>();
  snapshots = new Map<string, WeeklySnapshot>();
  invitations = new Map<string, Invitation>();
  invitationsByHash = new Map<string, string>();
  deliveries = new Map<string, NotificationDelivery>();

  async reset(): Promise<void> {
    this.users.clear();
    this.groups.clear();
    this.memberships.clear();
    this.goals.clear();
    this.completions.clear();
    this.snapshots.clear();
    this.invitations.clear();
    this.invitationsByHash.clear();
    this.deliveries.clear();
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async putUser(user: User): Promise<void> {
    this.users.set(user.userId, user);
  }

  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId);
  }

  async getGroup(groupId: string): Promise<Group | null> {
    return this.groups.get(groupId) ?? null;
  }

  async putGroup(group: Group): Promise<void> {
    this.groups.set(group.groupId, group);
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.groups.delete(groupId);
  }

  private membershipKey(groupId: string, userId: string): string {
    return `${groupId}#${userId}`;
  }

  async getMembership(groupId: string, userId: string): Promise<Membership | null> {
    return this.memberships.get(this.membershipKey(groupId, userId)) ?? null;
  }

  async putMembership(membership: Membership): Promise<void> {
    this.memberships.set(
      this.membershipKey(membership.groupId, membership.userId),
      membership,
    );
  }

  async listMembershipsByUser(userId: string): Promise<Membership[]> {
    return [...this.memberships.values()]
      .filter((m) => m.userId === userId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }

  async listMembershipsByGroup(groupId: string): Promise<Membership[]> {
    return [...this.memberships.values()].filter((m) => m.groupId === groupId);
  }

  private goalKey(groupId: string, userId: string, goalId: string): string {
    return `${groupUserKey(groupId, userId)}#${goalId}`;
  }

  async getGoal(groupId: string, userId: string, goalId: string): Promise<Goal | null> {
    return this.goals.get(this.goalKey(groupId, userId, goalId)) ?? null;
  }

  async putGoal(goal: Goal): Promise<void> {
    this.goals.set(this.goalKey(goal.groupId, goal.userId, goal.goalId), goal);
  }

  async deleteGoal(groupId: string, userId: string, goalId: string): Promise<void> {
    this.goals.delete(this.goalKey(groupId, userId, goalId));
  }

  async listGoals(groupId: string, userId: string): Promise<Goal[]> {
    const prefix = `${groupUserKey(groupId, userId)}#`;
    return [...this.goals.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, g]) => g)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private completionKey(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
    localDate: string,
    goalId: string,
  ): string {
    return `${groupUserWeekKey(groupId, userId, weekStartDateValue)}#${completionSortKey(localDate, goalId)}`;
  }

  async getCompletion(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
    localDate: string,
    goalId: string,
  ): Promise<Completion | null> {
    return (
      this.completions.get(
        this.completionKey(groupId, userId, weekStartDateValue, localDate, goalId),
      ) ?? null
    );
  }

  async putCompletion(
    completion: Completion,
  ): Promise<{ created: boolean; completion: Completion }> {
    const key = this.completionKey(
      completion.groupId,
      completion.userId,
      completion.weekStartDate,
      completion.localDate,
      completion.goalId,
    );
    const existing = this.completions.get(key);
    if (existing) {
      return { created: false, completion: existing };
    }
    this.completions.set(key, completion);
    return { created: true, completion };
  }

  async deleteCompletion(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
    localDate: string,
    goalId: string,
  ): Promise<boolean> {
    return this.completions.delete(
      this.completionKey(groupId, userId, weekStartDateValue, localDate, goalId),
    );
  }

  async listCompletionsForWeek(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
  ): Promise<Completion[]> {
    const prefix = `${groupUserWeekKey(groupId, userId, weekStartDateValue)}#`;
    return [...this.completions.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, c]) => c)
      .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.goalId.localeCompare(b.goalId));
  }

  async listCompletionsInRange(
    groupId: string,
    userId: string,
    from: string,
    to: string,
    weekStartsOn: Weekday,
  ): Promise<Completion[]> {
    const weeks = new Set<string>();
    let cursor = from;
    while (cursor <= to) {
      weeks.add(weekStartDate(cursor, weekStartsOn));
      const next = weekStartDate(cursor, weekStartsOn);
      // advance day by day
      const [y, m, d] = cursor.split('-').map(Number);
      const date = new Date(Date.UTC(y!, m! - 1, d! + 1));
      cursor = date.toISOString().slice(0, 10);
      void next;
    }
    const all: Completion[] = [];
    for (const week of weeks) {
      const rows = await this.listCompletionsForWeek(groupId, userId, week);
      all.push(...rows.filter((c) => c.localDate >= from && c.localDate <= to));
    }
    return all.sort(
      (a, b) => a.localDate.localeCompare(b.localDate) || a.goalId.localeCompare(b.goalId),
    );
  }

  async getWeeklySnapshot(
    groupId: string,
    weekStartDateValue: string,
    userId: string,
  ): Promise<WeeklySnapshot | null> {
    return (
      this.snapshots.get(`${groupWeekKey(groupId, weekStartDateValue)}#${userId}`) ?? null
    );
  }

  async putWeeklySnapshot(snapshot: WeeklySnapshot): Promise<void> {
    this.snapshots.set(
      `${groupWeekKey(snapshot.groupId, snapshot.weekStartDate)}#${snapshot.userId}`,
      snapshot,
    );
  }

  async getInvitation(invitationId: string): Promise<Invitation | null> {
    return this.invitations.get(invitationId) ?? null;
  }

  async getInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const id = this.invitationsByHash.get(tokenHash);
    if (!id) return null;
    return this.invitations.get(id) ?? null;
  }

  async putInvitation(invitation: Invitation): Promise<void> {
    this.invitations.set(invitation.invitationId, invitation);
    this.invitationsByHash.set(invitation.tokenHash, invitation.invitationId);
  }

  async putNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<{ created: boolean }> {
    const key = `${delivery.deliveryKey}#${delivery.attempt}`;
    if (this.deliveries.has(key) || [...this.deliveries.values()].some(
      (d) => d.deliveryKey === delivery.deliveryKey && d.status === 'sent',
    )) {
      return { created: false };
    }
    this.deliveries.set(key, delivery);
    return { created: true };
  }
}

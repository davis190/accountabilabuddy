import {
  addDays,
  adjustedGoalTarget,
  adjustedWeeklyPointTarget,
  availableDaysInWeek,
  todayInTimezone,
  weekEndDate,
  weekStartDate,
  type Goal,
  type Membership,
  type User,
  type WeeklySnapshot,
} from '@accountabilabuddy/shared';
import type { Store } from '../store/types.js';

export function memberToday(membership: Membership, user: User | null | undefined): string {
  return todayInTimezone(membership.timezone || user?.timezone || 'UTC');
}

export function isOpenWeek(
  weekStart: string,
  membership: Membership,
  user: User | null | undefined,
): boolean {
  const today = memberToday(membership, user);
  return addDays(weekStart, 6) >= today;
}

export function activeGoalTargets(goals: Goal[]): number[] {
  return goals.filter((g) => !g.archivedAt).map((g) => g.targetDaysPerWeek);
}

export function goalTargetMap(goals: Goal[], availableDays: number): Record<string, number> {
  return Object.fromEntries(
    goals
      .filter((g) => !g.archivedAt)
      .map((g) => [g.goalId, adjustedGoalTarget(g.targetDaysPerWeek, availableDays)]),
  );
}

async function awayCountForWeek(
  store: Store,
  userId: string,
  weekStart: string,
): Promise<number> {
  const end = weekEndDate(weekStart);
  const rows = await store.listAwayDaysInRange(userId, weekStart, end);
  return rows.length;
}

export async function ensureSnapshotForMembership(
  store: Store,
  groupId: string,
  weekStart: string,
  membership: Membership,
  goals: Goal[],
  points: number,
): Promise<WeeklySnapshot> {
  const existing = await store.getWeeklySnapshot(groupId, weekStart, membership.userId);
  const now = new Date().toISOString();
  const user = await store.getUser(membership.userId);
  const open = isOpenWeek(weekStart, membership, user);
  const awayCount = open ? await awayCountForWeek(store, membership.userId, weekStart) : 0;
  const available = availableDaysInWeek(awayCount);
  const weeklyTarget = open
    ? adjustedWeeklyPointTarget(
        membership.weeklyPointTarget,
        activeGoalTargets(goals),
        available,
      )
    : (existing?.weeklyPointTargetSnapshot ?? membership.weeklyPointTarget);
  const goalTargets = open
    ? goalTargetMap(goals, available)
    : (existing?.goalTargetSnapshot ?? goalTargetMap(goals, 7));

  if (existing) {
    const updated: WeeklySnapshot = {
      ...existing,
      points,
      weeklyPointTargetSnapshot: open ? weeklyTarget : existing.weeklyPointTargetSnapshot,
      goalTargetSnapshot: open ? goalTargets : existing.goalTargetSnapshot,
      lastRecalculatedAt: now,
      version: existing.version + 1,
    };
    await store.putWeeklySnapshot(updated);
    return updated;
  }
  const snapshot: WeeklySnapshot = {
    groupId,
    weekStartDate: weekStart,
    userId: membership.userId,
    weeklyPointTargetSnapshot: weeklyTarget,
    points,
    goalTargetSnapshot: goalTargets,
    lastRecalculatedAt: now,
    version: 1,
  };
  await store.putWeeklySnapshot(snapshot);
  return snapshot;
}

export async function refreshCurrentWeekTargetSnapshot(
  store: Store,
  groupId: string,
  membership: Membership,
): Promise<void> {
  const group = await store.getGroup(groupId);
  if (!group) return;
  const user = await store.getUser(membership.userId);
  const weekStart = weekStartDate(memberToday(membership, user), group.weekStartsOn);
  const existing = await store.getWeeklySnapshot(groupId, weekStart, membership.userId);
  if (!existing) return;
  const goals = await store.listGoals(groupId, membership.userId);
  const completions = await store.listCompletionsForWeek(
    groupId,
    membership.userId,
    weekStart,
  );
  await ensureSnapshotForMembership(
    store,
    groupId,
    weekStart,
    membership,
    goals,
    completions.length,
  );
}

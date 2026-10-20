import {
  assignTiedPositions,
  createId,
  goalCompletedDays,
  isFutureLocalDate,
  isGoalActiveOnDate,
  progressPercent,
  todayInTimezone,
  weekStartDate,
  type Completion,
  type Goal,
  type Membership,
  type User,
  type WeeklySnapshot,
} from '@accountabilabuddy/shared';
import { badRequest, forbidden, notFound } from '../errors.js';
import type { Store } from '../store/types.js';
import { requireActiveMembership } from './authz.js';

async function ensureSnapshot(
  store: Store,
  groupId: string,
  weekStart: string,
  membership: Membership,
  goals: Goal[],
  points: number,
): Promise<WeeklySnapshot> {
  const existing = await store.getWeeklySnapshot(groupId, weekStart, membership.userId);
  const now = new Date().toISOString();
  if (existing) {
    const updated: WeeklySnapshot = {
      ...existing,
      points,
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
    weeklyPointTargetSnapshot: membership.weeklyPointTarget,
    points,
    goalTargetSnapshot: Object.fromEntries(
      goals.filter((g) => !g.archivedAt).map((g) => [g.goalId, g.targetDaysPerWeek]),
    ),
    lastRecalculatedAt: now,
    version: 1,
  };
  await store.putWeeklySnapshot(snapshot);
  return snapshot;
}

function weekPayload(
  weekStart: string,
  pointsEarned: number,
  weeklyPointTarget: number,
  goal: Goal | null,
  completions: Completion[],
) {
  return {
    week: {
      weekStartDate: weekStart,
      pointsEarned,
      weeklyPointTarget,
      progressPercent: progressPercent(pointsEarned, weeklyPointTarget),
    },
    goalProgress: goal
      ? {
          completedDays: goalCompletedDays(completions, goal.goalId),
          targetDays: goal.targetDaysPerWeek,
        }
      : undefined,
  };
}

export async function putCompletion(
  store: Store,
  groupId: string,
  userId: string,
  localDate: string,
  goalId: string,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  const user = await store.getUser(userId);
  const today = todayInTimezone(membership.timezone || user?.timezone || 'UTC');
  if (isFutureLocalDate(localDate, today)) {
    throw badRequest('Future dates cannot be completed', { localDate: 'cannot be in the future' });
  }
  const goal = await store.getGoal(groupId, userId, goalId);
  if (!goal || goal.userId !== userId) throw notFound('Goal not found');
  if (!isGoalActiveOnDate(goal, localDate)) {
    throw badRequest('Goal is not active on this date');
  }

  const weekStart = weekStartDate(localDate, group.weekStartsOn);
  const now = new Date().toISOString();
  const completion: Completion = {
    completionId: createId('cmp'),
    groupId,
    userId,
    goalId,
    localDate,
    weekStartDate: weekStart,
    createdAt: now,
    updatedAt: now,
  };
  const result = await store.putCompletion(completion);
  const completions = await store.listCompletionsForWeek(groupId, userId, weekStart);
  const goals = await store.listGoals(groupId, userId);
  const snapshot = await ensureSnapshot(
    store,
    groupId,
    weekStart,
    membership,
    goals,
    completions.length,
  );

  return {
    completion: {
      groupId,
      goalId,
      localDate,
      points: 1,
      created: result.created,
    },
    ...weekPayload(
      weekStart,
      completions.length,
      snapshot.weeklyPointTargetSnapshot,
      goal,
      completions,
    ),
  };
}

export async function deleteCompletion(
  store: Store,
  groupId: string,
  userId: string,
  localDate: string,
  goalId: string,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  const goal = await store.getGoal(groupId, userId, goalId);
  if (goal && goal.userId !== userId) throw forbidden();

  const weekStart = weekStartDate(localDate, group.weekStartsOn);
  await store.deleteCompletion(groupId, userId, weekStart, localDate, goalId);
  const completions = await store.listCompletionsForWeek(groupId, userId, weekStart);
  const goals = await store.listGoals(groupId, userId);
  const snapshot = await ensureSnapshot(
    store,
    groupId,
    weekStart,
    membership,
    goals,
    completions.length,
  );

  return {
    deleted: true,
    ...weekPayload(
      weekStart,
      completions.length,
      snapshot.weeklyPointTargetSnapshot,
      goal,
      completions,
    ),
  };
}

export async function getMyDay(
  store: Store,
  groupId: string,
  userId: string,
  localDate: string,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  const goals = (await store.listGoals(groupId, userId)).filter((g) =>
    isGoalActiveOnDate(g, localDate),
  );
  const weekStart = weekStartDate(localDate, group.weekStartsOn);
  const completions = await store.listCompletionsForWeek(groupId, userId, weekStart);
  const completedGoalIds = new Set(
    completions.filter((c) => c.localDate === localDate).map((c) => c.goalId),
  );
  const snapshot = await store.getWeeklySnapshot(groupId, weekStart, userId);
  const target = snapshot?.weeklyPointTargetSnapshot ?? membership.weeklyPointTarget;

  return {
    localDate,
    weekStartDate: weekStart,
    pointsEarned: completions.length,
    weeklyPointTarget: target,
    progressPercent: progressPercent(completions.length, target),
    goals: goals.map((g) => ({
      ...g,
      checked: completedGoalIds.has(g.goalId),
      completedDaysThisWeek: goalCompletedDays(completions, g.goalId),
    })),
  };
}

export async function getWeekComparison(
  store: Store,
  groupId: string,
  viewerId: string,
  weekStart: string,
) {
  const { group } = await requireActiveMembership(store, groupId, viewerId);
  if (weekStartDate(weekStart, group.weekStartsOn) !== weekStart) {
    throw badRequest('weekStartDate must be a valid week start for this group');
  }

  const memberships = (await store.listMembershipsByGroup(groupId)).filter(
    (m) => m.status === 'active',
  );

  const inputs = await Promise.all(
    memberships.map(async (m) => {
      const user = (await store.getUser(m.userId)) as User | null;
      const completions = await store.listCompletionsForWeek(groupId, m.userId, weekStart);
      const goals = await store.listGoals(groupId, m.userId);
      const snapshot = await store.getWeeklySnapshot(groupId, weekStart, m.userId);
      const target = snapshot?.weeklyPointTargetSnapshot ?? m.weeklyPointTarget;
      return {
        userId: m.userId,
        displayName: user?.displayName ?? 'Member',
        avatarUrl: user?.avatarUrl,
        pointsEarned: completions.length,
        weeklyPointTarget: target,
        goalProgress: goals
          .filter((g) => isGoalActiveOnDate(g, weekStart) || completions.some((c) => c.goalId === g.goalId))
          .map((g) => ({
            goalId: g.goalId,
            name: g.name,
            icon: g.icon,
            completedDays: goalCompletedDays(completions, g.goalId),
            targetDays: snapshot?.goalTargetSnapshot[g.goalId] ?? g.targetDaysPerWeek,
          })),
      };
    }),
  );

  return {
    groupId,
    weekStartDate: weekStart,
    weekStartsOn: group.weekStartsOn,
    disclaimer:
      'Friendly progress comparison — members choose their own goals and targets.',
    members: assignTiedPositions(inputs),
  };
}

export async function getMemberHistory(
  store: Store,
  groupId: string,
  viewerId: string,
  memberId: string,
  from: string,
  to: string,
) {
  const { group } = await requireActiveMembership(store, groupId, viewerId);
  const membership = await store.getMembership(groupId, memberId);
  if (!membership) throw notFound('Member not found');

  const completions = await store.listCompletionsInRange(
    groupId,
    memberId,
    from,
    to,
    group.weekStartsOn,
  );
  const goals = await store.listGoals(groupId, memberId);
  const goalMap = new Map(goals.map((g) => [g.goalId, g]));

  const byDate = new Map<string, Array<{ goalId: string; name: string; icon?: string }>>();
  for (const c of completions) {
    const list = byDate.get(c.localDate) ?? [];
    const goal = goalMap.get(c.goalId);
    list.push({
      goalId: c.goalId,
      name: goal?.name ?? 'Goal',
      icon: goal?.icon,
    });
    byDate.set(c.localDate, list);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([localDate, items]) => ({ localDate, completions: items }));

  return {
    groupId,
    userId: memberId,
    from,
    to,
    days,
    readOnly: memberId !== viewerId,
  };
}

export async function getMemberWeekDetail(
  store: Store,
  groupId: string,
  viewerId: string,
  memberId: string,
  weekStart: string,
) {
  await requireActiveMembership(store, groupId, viewerId);
  const membership = await store.getMembership(groupId, memberId);
  if (!membership) throw notFound('Member not found');

  const { group } = await requireActiveMembership(store, groupId, viewerId);
  const completions = await store.listCompletionsForWeek(groupId, memberId, weekStart);
  const goals = await store.listGoals(groupId, memberId);
  const snapshot = await store.getWeeklySnapshot(groupId, weekStart, memberId);
  const user = await store.getUser(memberId);

  return {
    groupId,
    userId: memberId,
    displayName:
      membership.status === 'active' ? user?.displayName ?? 'Member' : 'Former member',
    weekStartDate: weekStart,
    weekStartsOn: group.weekStartsOn,
    pointsEarned: completions.length,
    weeklyPointTarget: snapshot?.weeklyPointTargetSnapshot ?? membership.weeklyPointTarget,
    progressPercent: progressPercent(
      completions.length,
      snapshot?.weeklyPointTargetSnapshot ?? membership.weeklyPointTarget,
    ),
    goals: goals.map((g) => ({
      goalId: g.goalId,
      name: g.name,
      icon: g.icon,
      targetDays: snapshot?.goalTargetSnapshot[g.goalId] ?? g.targetDaysPerWeek,
      completedDays: goalCompletedDays(completions, g.goalId),
      dates: completions.filter((c) => c.goalId === g.goalId).map((c) => c.localDate),
    })),
    completions,
    readOnly: memberId !== viewerId,
  };
}

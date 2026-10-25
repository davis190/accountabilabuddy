import {
  adjustedGoalTarget,
  adjustedWeeklyPointTarget,
  assignTiedPositions,
  availableDaysInWeek,
  createId,
  goalCompletedDays,
  isFutureLocalDate,
  isGoalActiveOnDate,
  progressPercent,
  todayInTimezone,
  type Completion,
  type Goal,
  type Membership,
  type User,
  type Weekday,
  type WeeklySnapshot,
  weekStartDate,
} from '@accountabilabuddy/shared';
import { badRequest, forbidden, notFound } from '../errors.js';
import type { Store } from '../store/types.js';
import { requireActiveMembership } from './authz.js';
import { listAwayDatesForWeek, listAwayDatesInRange } from './away.js';
import {
  activeGoalTargets,
  ensureSnapshotForMembership,
  isOpenWeek,
  refreshCurrentWeekTargetSnapshot as refreshSnapshot,
} from './snapshots.js';

export { refreshSnapshot as refreshCurrentWeekTargetSnapshot };

function effectiveGoalTarget(
  baseTarget: number,
  availableDays: number,
  open: boolean,
  snapshotTarget: number | undefined,
): number {
  if (!open) return snapshotTarget ?? baseTarget;
  return adjustedGoalTarget(baseTarget, availableDays);
}

function effectiveWeeklyTarget(
  baseTarget: number,
  goals: Goal[],
  availableDays: number,
  open: boolean,
  snapshotTarget: number | undefined,
): number {
  if (!open) return snapshotTarget ?? baseTarget;
  return adjustedWeeklyPointTarget(baseTarget, activeGoalTargets(goals), availableDays);
}

/**
 * Live membership target for the open (current/future) week; frozen snapshot for past weeks.
 * Open-week values include Away adjustments.
 */
export function resolveWeeklyPointTarget(
  weekStart: string,
  _weekStartsOn: Weekday,
  membership: Membership,
  snapshot: WeeklySnapshot | null | undefined,
  user: User | null | undefined,
  goals: Goal[] = [],
  awayDayCount = 0,
): number {
  const open = isOpenWeek(weekStart, membership, user);
  const available = availableDaysInWeek(awayDayCount);
  return effectiveWeeklyTarget(
    membership.weeklyPointTarget,
    goals,
    available,
    open,
    snapshot?.weeklyPointTargetSnapshot,
  );
}

export { ensureSnapshotForMembership };

function weekPayload(
  weekStart: string,
  pointsEarned: number,
  weeklyPointTarget: number,
  goal: Goal | null,
  completions: Completion[],
  targetDays: number,
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
          targetDays,
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
  const away = await store.getAwayDay(userId, localDate);
  if (away) {
    throw badRequest('Cannot check goals on an Away day', { localDate: 'marked Away' });
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
  const awayDates = await listAwayDatesForWeek(store, userId, weekStart);
  const available = availableDaysInWeek(awayDates.length);
  const snapshot = await ensureSnapshotForMembership(
    store,
    groupId,
    weekStart,
    membership,
    goals,
    completions.length,
  );
  const target = resolveWeeklyPointTarget(
    weekStart,
    group.weekStartsOn,
    membership,
    snapshot,
    user,
    goals,
    awayDates.length,
  );
  const goalTarget = adjustedGoalTarget(goal.targetDaysPerWeek, available);

  return {
    completion: {
      groupId,
      goalId,
      localDate,
      points: 1,
      created: result.created,
    },
    ...weekPayload(weekStart, completions.length, target, goal, completions, goalTarget),
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
  const awayDates = await listAwayDatesForWeek(store, userId, weekStart);
  const available = availableDaysInWeek(awayDates.length);
  const snapshot = await ensureSnapshotForMembership(
    store,
    groupId,
    weekStart,
    membership,
    goals,
    completions.length,
  );
  const user = await store.getUser(userId);
  const target = resolveWeeklyPointTarget(
    weekStart,
    group.weekStartsOn,
    membership,
    snapshot,
    user,
    goals,
    awayDates.length,
  );
  const goalTarget = goal ? adjustedGoalTarget(goal.targetDaysPerWeek, available) : 0;

  return {
    deleted: true,
    ...weekPayload(weekStart, completions.length, target, goal, completions, goalTarget),
  };
}

export async function getMyDay(
  store: Store,
  groupId: string,
  userId: string,
  localDate: string,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  const allGoals = await store.listGoals(groupId, userId);
  const goals = allGoals.filter((g) => isGoalActiveOnDate(g, localDate));
  const weekStart = weekStartDate(localDate, group.weekStartsOn);
  const completions = await store.listCompletionsForWeek(groupId, userId, weekStart);
  const completedGoalIds = new Set(
    completions.filter((c) => c.localDate === localDate).map((c) => c.goalId),
  );
  const snapshot = await store.getWeeklySnapshot(groupId, weekStart, userId);
  const user = await store.getUser(userId);
  const awayDates = await listAwayDatesForWeek(store, userId, weekStart);
  const away = awayDates.includes(localDate);
  const available = availableDaysInWeek(awayDates.length);
  const open = isOpenWeek(weekStart, membership, user);
  const target = resolveWeeklyPointTarget(
    weekStart,
    group.weekStartsOn,
    membership,
    snapshot,
    user,
    allGoals,
    awayDates.length,
  );

  return {
    localDate,
    weekStartDate: weekStart,
    away,
    awayDates,
    pointsEarned: completions.length,
    weeklyPointTarget: target,
    progressPercent: progressPercent(completions.length, target),
    goals: goals.map((g) => ({
      ...g,
      checked: completedGoalIds.has(g.goalId),
      completedDaysThisWeek: goalCompletedDays(completions, g.goalId),
      targetDaysPerWeek: effectiveGoalTarget(
        g.targetDaysPerWeek,
        available,
        open,
        snapshot?.goalTargetSnapshot[g.goalId],
      ),
      baseTargetDaysPerWeek: g.targetDaysPerWeek,
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
      const awayDates = await listAwayDatesForWeek(store, m.userId, weekStart);
      const available = availableDaysInWeek(awayDates.length);
      const current = isOpenWeek(weekStart, m, user);
      const target = resolveWeeklyPointTarget(
        weekStart,
        group.weekStartsOn,
        m,
        snapshot,
        user,
        goals,
        awayDates.length,
      );
      return {
        userId: m.userId,
        displayName: user?.displayName ?? 'Member',
        avatarUrl: user?.avatarUrl,
        pointsEarned: completions.length,
        weeklyPointTarget: target,
        awayDates,
        goalProgress: goals
          .filter(
            (g) =>
              isGoalActiveOnDate(g, weekStart) || completions.some((c) => c.goalId === g.goalId),
          )
          .map((g) => ({
            goalId: g.goalId,
            name: g.name,
            icon: g.icon,
            completedDays: goalCompletedDays(completions, g.goalId),
            targetDays: effectiveGoalTarget(
              g.targetDaysPerWeek,
              available,
              current,
              snapshot?.goalTargetSnapshot[g.goalId],
            ),
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
  const awayDates = await listAwayDatesInRange(store, memberId, from, to);
  const awaySet = new Set(awayDates);

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

  for (const d of awayDates) {
    if (!byDate.has(d)) byDate.set(d, []);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([localDate, items]) => ({
      localDate,
      away: awaySet.has(localDate),
      completions: items,
    }));

  return {
    groupId,
    userId: memberId,
    from,
    to,
    awayDates,
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
  const awayDates = await listAwayDatesForWeek(store, memberId, weekStart);
  const available = availableDaysInWeek(awayDates.length);
  const target = resolveWeeklyPointTarget(
    weekStart,
    group.weekStartsOn,
    membership,
    snapshot,
    user,
    goals,
    awayDates.length,
  );
  const current = isOpenWeek(weekStart, membership, user);

  return {
    groupId,
    userId: memberId,
    displayName:
      membership.status === 'active' ? user?.displayName ?? 'Member' : 'Former member',
    weekStartDate: weekStart,
    weekStartsOn: group.weekStartsOn,
    awayDates,
    pointsEarned: completions.length,
    weeklyPointTarget: target,
    progressPercent: progressPercent(completions.length, target),
    goals: goals.map((g) => ({
      goalId: g.goalId,
      name: g.name,
      icon: g.icon,
      targetDays: effectiveGoalTarget(
        g.targetDaysPerWeek,
        available,
        current,
        snapshot?.goalTargetSnapshot[g.goalId],
      ),
      completedDays: goalCompletedDays(completions, g.goalId),
      dates: completions.filter((c) => c.goalId === g.goalId).map((c) => c.localDate),
    })),
    completions,
    readOnly: memberId !== viewerId,
  };
}

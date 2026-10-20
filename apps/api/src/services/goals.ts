import {
  createId,
  optionalString,
  recommendedWeeklyTarget,
  requireGoalIcon,
  requireInt,
  requireLocalDate,
  requireString,
  stripHtml,
  type Goal,
} from '@accountabilabuddy/shared';
import { forbidden, notFound } from '../errors.js';
import type { Store } from '../store/types.js';
import { requireActiveMembership } from './authz.js';

/**
 * If the member is still on the previous recommended weekly target (the default),
 * keep that target in sync when goals change. Custom targets are left alone.
 */
async function syncWeeklyTargetIfOnRecommended(
  store: Store,
  groupId: string,
  userId: string,
  previousGoals: Goal[],
) {
  const membership = await store.getMembership(groupId, userId);
  if (!membership || membership.status !== 'active') return;

  const previousRecommended = recommendedWeeklyTarget(previousGoals);
  if (membership.weeklyPointTarget !== previousRecommended) return;

  const nextGoals = await store.listGoals(groupId, userId);
  const nextRecommended = recommendedWeeklyTarget(nextGoals);
  if (nextRecommended === membership.weeklyPointTarget) return;

  const updated = {
    ...membership,
    weeklyPointTarget: nextRecommended,
    targetEffectiveAt: new Date().toISOString(),
    version: membership.version + 1,
  };
  await store.putMembership(updated);
  const { refreshCurrentWeekTargetSnapshot } = await import('./completions.js');
  await refreshCurrentWeekTargetSnapshot(store, groupId, updated);
}

export async function listMyGoals(store: Store, groupId: string, userId: string) {
  await requireActiveMembership(store, groupId, userId);
  return store.listGoals(groupId, userId);
}

export async function listMemberGoals(
  store: Store,
  groupId: string,
  viewerId: string,
  memberId: string,
) {
  await requireActiveMembership(store, groupId, viewerId);
  const membership = await store.getMembership(groupId, memberId);
  if (!membership || (membership.status !== 'active' && membership.status !== 'left' && membership.status !== 'removed')) {
    throw notFound('Member not found');
  }
  return store.listGoals(groupId, memberId);
}

export async function createGoal(
  store: Store,
  groupId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  await requireActiveMembership(store, groupId, userId);
  const existing = await store.listGoals(groupId, userId);
  const now = new Date().toISOString();
  const today = body.activeFrom
    ? requireLocalDate(body.activeFrom, 'activeFrom')
    : now.slice(0, 10);
  const goal: Goal = {
    goalId: createId('goal'),
    groupId,
    userId,
    name: stripHtml(requireString(body.name, 'name', 1, 60)),
    icon: requireGoalIcon(body.icon),
    description: optionalString(body.description, 'description', 160)
      ? stripHtml(optionalString(body.description, 'description', 160)!)
      : undefined,
    targetDaysPerWeek: requireInt(body.targetDaysPerWeek ?? 2, 'targetDaysPerWeek', 1, 7),
    activeFrom: today,
    sortOrder:
      body.sortOrder === undefined
        ? existing.length
        : requireInt(body.sortOrder, 'sortOrder', 0, 1000),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await store.putGoal(goal);
  await syncWeeklyTargetIfOnRecommended(store, groupId, userId, existing);
  return goal;
}

export async function updateGoal(
  store: Store,
  groupId: string,
  userId: string,
  goalId: string,
  body: Record<string, unknown>,
) {
  await requireActiveMembership(store, groupId, userId);
  const goal = await store.getGoal(groupId, userId, goalId);
  if (!goal) throw notFound('Goal not found');
  if (goal.userId !== userId) throw forbidden();

  const previousGoals = await store.listGoals(groupId, userId);
  const next: Goal = {
    ...goal,
    updatedAt: new Date().toISOString(),
    version: goal.version + 1,
  };
  if (body.name !== undefined) {
    next.name = stripHtml(requireString(body.name, 'name', 1, 60));
  }
  if (body.icon !== undefined) next.icon = requireGoalIcon(body.icon);
  if (body.description !== undefined) {
    const desc = optionalString(body.description, 'description', 160);
    next.description = desc ? stripHtml(desc) : undefined;
  }
  if (body.targetDaysPerWeek !== undefined) {
    next.targetDaysPerWeek = requireInt(body.targetDaysPerWeek, 'targetDaysPerWeek', 1, 7);
  }
  if (body.sortOrder !== undefined) {
    next.sortOrder = requireInt(body.sortOrder, 'sortOrder', 0, 1000);
  }
  if (body.archive === true && !next.archivedAt) {
    next.archivedAt = new Date().toISOString().slice(0, 10);
  }
  if (body.archive === false) {
    next.archivedAt = undefined;
  }
  await store.putGoal(next);
  const affectsTarget =
    body.targetDaysPerWeek !== undefined ||
    body.archive === true ||
    body.archive === false;
  if (affectsTarget) {
    await syncWeeklyTargetIfOnRecommended(store, groupId, userId, previousGoals);
  }
  return next;
}

export async function deleteOrArchiveGoal(
  store: Store,
  groupId: string,
  userId: string,
  goalId: string,
) {
  await requireActiveMembership(store, groupId, userId);
  const goal = await store.getGoal(groupId, userId, goalId);
  if (!goal) throw notFound('Goal not found');
  if (goal.userId !== userId) throw forbidden();

  const previousGoals = await store.listGoals(groupId, userId);
  // Check for any completions via week listing would be expensive; use GSI pattern:
  // for memory store, scan completions for this goal
  const hasHistory = await goalHasCompletions(store, goal);
  if (hasHistory) {
    const archived = {
      ...goal,
      archivedAt: goal.archivedAt ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
      version: goal.version + 1,
    };
    await store.putGoal(archived);
    await syncWeeklyTargetIfOnRecommended(store, groupId, userId, previousGoals);
    return { archived: true, goal: archived };
  }
  await store.deleteGoal(groupId, userId, goalId);
  await syncWeeklyTargetIfOnRecommended(store, groupId, userId, previousGoals);
  return { archived: false, goal: null };
}

async function goalHasCompletions(store: Store, goal: Goal): Promise<boolean> {
  // Bounded probe: check recent weeks from activeFrom
  const { weekStartDate, addDays } = await import('@accountabilabuddy/shared');
  let cursor = goal.activeFrom;
  const end = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  while (cursor <= end) {
    const week = weekStartDate(cursor, 'monday');
    if (!seen.has(week)) {
      seen.add(week);
      const rows = await store.listCompletionsForWeek(goal.groupId, goal.userId, week);
      if (rows.some((c) => c.goalId === goal.goalId)) return true;
    }
    cursor = addDays(cursor, 7);
    if (seen.size > 520) break;
  }
  return false;
}

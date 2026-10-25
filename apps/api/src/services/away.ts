import {
  isDateInWeek,
  requireLocalDate,
  todayInTimezone,
  weekEndDate,
  weekStartDate,
  type AwayDay,
} from '@accountabilabuddy/shared';
import { badRequest } from '../errors.js';
import type { Store } from '../store/types.js';
import { ensureSnapshotForMembership } from './snapshots.js';

/** Away may only be set for dates in the member's current Monday-start week. */
export function assertAwayInCurrentWeek(
  localDate: string,
  timezone: string,
  now = new Date(),
): { today: string; weekStart: string } {
  const today = todayInTimezone(timezone, now);
  const weekStart = weekStartDate(today, 'monday');
  if (!isDateInWeek(localDate, weekStart)) {
    throw badRequest('Away can only be set for days in the current week', {
      localDate: 'must be in the current week',
    });
  }
  return { today, weekStart };
}

async function clearCompletionsOnDate(
  store: Store,
  userId: string,
  localDate: string,
): Promise<void> {
  const memberships = (await store.listMembershipsByUser(userId)).filter(
    (m) => m.status === 'active',
  );
  for (const membership of memberships) {
    const group = await store.getGroup(membership.groupId);
    if (!group || group.status !== 'active') continue;
    const weekStart = weekStartDate(localDate, group.weekStartsOn);
    const completions = await store.listCompletionsForWeek(
      membership.groupId,
      userId,
      weekStart,
    );
    for (const c of completions.filter((row) => row.localDate === localDate)) {
      await store.deleteCompletion(
        membership.groupId,
        userId,
        weekStart,
        localDate,
        c.goalId,
      );
    }
    const remaining = await store.listCompletionsForWeek(
      membership.groupId,
      userId,
      weekStart,
    );
    const goals = await store.listGoals(membership.groupId, userId);
    await ensureSnapshotForMembership(
      store,
      membership.groupId,
      weekStart,
      membership,
      goals,
      remaining.length,
    );
  }
}

async function refreshOpenWeekSnapshots(store: Store, userId: string): Promise<void> {
  const memberships = (await store.listMembershipsByUser(userId)).filter(
    (m) => m.status === 'active',
  );
  const user = await store.getUser(userId);
  for (const membership of memberships) {
    const group = await store.getGroup(membership.groupId);
    if (!group || group.status !== 'active') continue;
    const today = todayInTimezone(membership.timezone || user?.timezone || 'UTC');
    const weekStart = weekStartDate(today, group.weekStartsOn);
    const completions = await store.listCompletionsForWeek(
      membership.groupId,
      userId,
      weekStart,
    );
    const goals = await store.listGoals(membership.groupId, userId);
    await ensureSnapshotForMembership(
      store,
      membership.groupId,
      weekStart,
      membership,
      goals,
      completions.length,
    );
  }
}

export async function markAway(store: Store, userId: string, localDateRaw: string) {
  const localDate = requireLocalDate(localDateRaw, 'localDate');
  const user = await store.getUser(userId);
  if (!user) throw badRequest('User not found');
  assertAwayInCurrentWeek(localDate, user.timezone);

  const existing = await store.getAwayDay(userId, localDate);
  if (!existing) {
    const away: AwayDay = {
      userId,
      localDate,
      createdAt: new Date().toISOString(),
    };
    await store.putAwayDay(away);
  }

  await clearCompletionsOnDate(store, userId, localDate);
  await refreshOpenWeekSnapshots(store, userId);

  return { away: true, localDate };
}

export async function unmarkAway(store: Store, userId: string, localDateRaw: string) {
  const localDate = requireLocalDate(localDateRaw, 'localDate');
  const user = await store.getUser(userId);
  if (!user) throw badRequest('User not found');
  assertAwayInCurrentWeek(localDate, user.timezone);

  await store.deleteAwayDay(userId, localDate);
  await refreshOpenWeekSnapshots(store, userId);

  return { away: false, localDate };
}

export async function listAwayDatesForWeek(
  store: Store,
  userId: string,
  weekStart: string,
): Promise<string[]> {
  const end = weekEndDate(weekStart);
  const rows = await store.listAwayDaysInRange(userId, weekStart, end);
  return rows.map((r) => r.localDate);
}

export async function listAwayDatesInRange(
  store: Store,
  userId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const rows = await store.listAwayDaysInRange(userId, from, to);
  return rows.map((r) => r.localDate);
}

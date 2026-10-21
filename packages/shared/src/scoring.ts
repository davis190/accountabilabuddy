import type { Completion, Goal, MemberWeekSummary } from './types.js';

export function progressPercent(pointsEarned: number, weeklyPointTarget: number): number {
  if (weeklyPointTarget <= 0) return 0;
  return Math.round((pointsEarned / weeklyPointTarget) * 1000) / 10;
}

export function statusLabel(
  pointsEarned: number,
  weeklyPointTarget: number,
): MemberWeekSummary['statusLabel'] {
  if (pointsEarned >= weeklyPointTarget) return 'Target reached';
  if (pointsEarned >= weeklyPointTarget * 0.6) return 'On track';
  return 'Keep going';
}

export function countWeeklyPoints(completions: Completion[]): number {
  return completions.length;
}

export function goalCompletedDays(
  completions: Completion[],
  goalId: string,
): number {
  const days = new Set(
    completions.filter((c) => c.goalId === goalId).map((c) => c.localDate),
  );
  return days.size;
}

export function recommendedWeeklyTarget(goals: Goal[]): number {
  const sum = goals
    .filter((g) => !g.archivedAt)
    .reduce((acc, g) => acc + g.targetDaysPerWeek, 0);
  return Math.min(100, Math.max(1, sum || 1));
}

export interface RankInput {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  pointsEarned: number;
  weeklyPointTarget: number;
  goalProgress: MemberWeekSummary['goalProgress'];
}

/**
 * Assign friendly comparison positions with ties allowed.
 * Order: progress % desc, then points desc, then displayName asc (render only).
 * Positions: 1, 2, 2, 4 — no hidden tie-breakers.
 */
export function assignTiedPositions(members: RankInput[]): MemberWeekSummary[] {
  const sorted = [...members].sort((a, b) => {
    const pa = progressPercent(a.pointsEarned, a.weeklyPointTarget);
    const pb = progressPercent(b.pointsEarned, b.weeklyPointTarget);
    if (pb !== pa) return pb - pa;
    if (b.pointsEarned !== a.pointsEarned) return b.pointsEarned - a.pointsEarned;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });

  const results: MemberWeekSummary[] = [];
  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i]!;
    const currentKey = rankKey(current);
    let j = i + 1;
    while (j < sorted.length && rankKey(sorted[j]!) === currentKey) {
      j += 1;
    }
    const position = i + 1;
    const tied = j - i > 1;
    for (let k = i; k < j; k += 1) {
      const m = sorted[k]!;
      results.push({
        userId: m.userId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        pointsEarned: m.pointsEarned,
        weeklyPointTarget: m.weeklyPointTarget,
        progressPercent: progressPercent(m.pointsEarned, m.weeklyPointTarget),
        position,
        tied,
        statusLabel: statusLabel(m.pointsEarned, m.weeklyPointTarget),
        goalProgress: m.goalProgress,
      });
    }
    i = j;
  }
  return results;
}

function rankKey(m: RankInput): string {
  return `${progressPercent(m.pointsEarned, m.weeklyPointTarget)}|${m.pointsEarned}`;
}

export function isGoalActiveOnDate(goal: Goal, localDate: string): boolean {
  if (localDate < goal.activeFrom) return false;
  // archivedAt is the first day the goal is no longer on the checklist
  if (goal.archivedAt && localDate >= goal.archivedAt) return false;
  return true;
}

export function formatPosition(position: number, tied: boolean): string {
  const ordinal = toOrdinal(position);
  return tied ? `${ordinal} (tied)` : ordinal;
}

function toOrdinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

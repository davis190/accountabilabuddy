import {
  assignTiedPositions,
  formatPosition,
  goalCompletedDays,
  isGoalActiveOnDate,
  progressPercent,
  recommendedWeeklyTarget,
  statusLabel,
} from '../scoring.js';
import type { Completion, Goal } from '../types.js';

const completion = (
  goalId: string,
  localDate: string,
): Completion => ({
  completionId: `c_${goalId}_${localDate}`,
  groupId: 'grp_1',
  userId: 'u_1',
  goalId,
  localDate,
  weekStartDate: '2026-10-19',
  createdAt: '2026-10-19T00:00:00Z',
  updatedAt: '2026-10-19T00:00:00Z',
});

describe('scoring', () => {
  it('counts four runs as four points against a 2x target', () => {
    const completions = [
      completion('run', '2026-10-19'),
      completion('run', '2026-10-21'),
      completion('run', '2026-10-23'),
      completion('run', '2026-10-25'),
      completion('lift', '2026-10-20'),
      completion('stretch', '2026-10-20'),
      completion('stretch', '2026-10-22'),
    ];
    expect(completions.length).toBe(7);
    expect(goalCompletedDays(completions, 'run')).toBe(4);
  });

  it('allows progress above 100%', () => {
    expect(progressPercent(12, 10)).toBe(120);
    expect(statusLabel(12, 10)).toBe('Target reached');
  });

  it('assigns tied positions 1, 2, 2, 4', () => {
    const ranked = assignTiedPositions([
      { userId: 'a', displayName: 'Ada', pointsEarned: 10, weeklyPointTarget: 10, goalProgress: [] },
      { userId: 'b', displayName: 'Bea', pointsEarned: 8, weeklyPointTarget: 10, goalProgress: [] },
      { userId: 'c', displayName: 'Cal', pointsEarned: 8, weeklyPointTarget: 10, goalProgress: [] },
      { userId: 'd', displayName: 'Dee', pointsEarned: 5, weeklyPointTarget: 10, goalProgress: [] },
    ]);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 2, 4]);
    expect(ranked[1]!.tied).toBe(true);
    expect(ranked[2]!.tied).toBe(true);
    expect(formatPosition(2, true)).toBe('2nd (tied)');
  });

  it('does not use display name as a tie-breaker for position', () => {
    const ranked = assignTiedPositions([
      { userId: 'z', displayName: 'Zoe', pointsEarned: 5, weeklyPointTarget: 10, goalProgress: [] },
      { userId: 'a', displayName: 'Amy', pointsEarned: 5, weeklyPointTarget: 10, goalProgress: [] },
    ]);
    expect(ranked[0]!.position).toBe(1);
    expect(ranked[1]!.position).toBe(1);
    expect(ranked.every((r) => r.tied)).toBe(true);
  });

  it('recommends sum of active goal frequencies', () => {
    const goals: Goal[] = [
      {
        goalId: '1',
        groupId: 'g',
        userId: 'u',
        name: 'Run',
        targetDaysPerWeek: 2,
        activeFrom: '2026-10-01',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        version: 1,
      },
      {
        goalId: '2',
        groupId: 'g',
        userId: 'u',
        name: 'Lift',
        targetDaysPerWeek: 3,
        activeFrom: '2026-10-01',
        archivedAt: '2026-10-10',
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
        version: 1,
      },
    ];
    expect(recommendedWeeklyTarget(goals)).toBe(2);
  });

  it('respects goal active and archive dates', () => {
    const goal: Goal = {
      goalId: '1',
      groupId: 'g',
      userId: 'u',
      name: 'Run',
      targetDaysPerWeek: 2,
      activeFrom: '2026-10-10',
      archivedAt: '2026-10-20',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
      version: 1,
    };
    expect(isGoalActiveOnDate(goal, '2026-10-09')).toBe(false);
    expect(isGoalActiveOnDate(goal, '2026-10-15')).toBe(true);
    expect(isGoalActiveOnDate(goal, '2026-10-20')).toBe(false);
    expect(isGoalActiveOnDate(goal, '2026-10-21')).toBe(false);
  });
});
